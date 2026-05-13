package main

// Package main contains all API endpoint handlers for the HireKey application.
// Each handler function follows a consistent pattern: validate authentication,
// parse and sanitize input, perform MongoDB operations, and return JSON responses.
//
// API endpoint groups:
//
//	Feed & Posts:
//	  GET    /api/v1/feed           - Get feed posts
//	  GET    /api/v1/post/{id}      - Get single post
//	  GET    /api/v1/post/view      - Record post view
//	  POST   /api/v1/post/edit      - Edit post
//	  POST   /api/v1/post/delete    - Delete post
//
//	Profiles:
//	  GET    /api/v1/profile/{user}  - Get user profile
//	  GET    /api/v1/profile/events  - Get profile events
//
//	Search:
//	  GET    /api/v1/search/profile  - Search profiles
//
//	Interactions (like/follow/share/repost/save):
//	  POST   /api/v1/like            - Toggle like
//	  GET    /api/v1/like/state      - Check like state
//	  POST   /api/v1/like/state      - Batch check like states
//	  POST   /api/v1/follow          - Toggle follow
//	  ... (similar for share, repost, save)
//
//	Moderation:
//	  POST   /api/v1/block           - Block user
//	  GET    /api/v1/block/list      - Get blocked profiles
//	  POST   /api/v1/report          - Report content
//
//	Comments:
//	  POST   /api/v1/comment         - Create comment
//
//	Messages & Chat:
//	  See chat.go
//
//	Settings:
//	  GET    /api/v1/settings/account     - Get account settings
//	  POST   /api/v1/settings/account     - Update account
//	  POST   /api/v1/settings/password    - Update password
//	  POST   /api/v1/settings/logout      - Logout
//	  POST   /api/v1/settings/account/delete - Delete account
//
//	Miscellaneous:
//	  GET    /api/v1/story          - Get stories
//	  GET    /api/v1/marketplace    - List marketplace listings
//	  GET    /api/v1/event          - List events
//	  POST   /api/v1/event/rsvp     - RSVP to event
//	  GET    /api/v1/recruit        - List recruitment candidates

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const searchProfilesLimitDefault = 100

const searchProfilesLimitMax = 250

const feedPostsLimitDefault = 10

const feedPostsLimitMax = 100

const feedPostTextMaxChars = 2000

const feedPostMediaListMaxItems = 8

const feedPostMediaURLMaxChars = 3000

const viewedPostLookupLimit = 5000

const recruitListLimitDefault = 250

const recruitListLimitMax = 500

const marketplaceListLimitDefault = 30

const marketplaceListLimitMax = 100

const marketplaceFieldMaxChars = 240

const marketplaceDescriptionMaxChars = 3000

const eventListLimitDefault = 12

const eventListLimitMax = 100

const profileEventListLimitDefault = 30

const profileEventListLimitMax = 100

const eventFieldMaxChars = 240

const eventDescriptionMaxChars = 3000

const interactionBatchLimit = 500

const commentListLimitDefault = 100

const commentListLimitMax = 300

const moderationReasonMaxChars = 500

const storyListLimitDefault = 30

const storyListLimitMax = 100

const storyTextMaxChars = 2000

const storyMediaURLMaxChars = 3000

const storyExpiryDurationSeconds int64 = 24 * 60 * 60

const storyCleanupInterval = 5 * time.Minute

var errSearchQueryTooShort = errors.New("query too short")

// GetProfileHandler retrieves a user profile by username from the profiles collection.
// Returns the full profile data as JSON.
func GetProfileHandler(w http.ResponseWriter, r *http.Request) {
	usernameStr := sanitizeString(strings.TrimPrefix(r.URL.Path, "/api/v1/profile/"), false)
	if usernameStr == "" {
		http.Error(w, `{"error": "ID not provided"}`, http.StatusBadRequest)
		return
	}

	collection := client.Database(DBName).Collection("profiles")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var profile ProfileData
	err := collection.FindOne(ctx, bson.M{"username": usernameStr}).Decode(&profile)
	if err == mongo.ErrNoDocuments {
		http.Error(w, `{"error": "Profile not found"}`, http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, `{"error": "Database error"}`, http.StatusInternalServerError)
		return
	}

	hasActiveStory, err := hasActiveStoryForProfile(ctx, profile.Id)
	if err != nil {
		http.Error(w, `{"error": "Database error"}`, http.StatusInternalServerError)
		return
	}
	profile.HasActiveStory = hasActiveStory

	writeJSON(w, profile)
}

// GetPostHandler retrieves a single post by its MongoDB ObjectID, including
// the associated comment count and post details.
func GetPostHandler(w http.ResponseWriter, r *http.Request) {
	idStr := sanitizeString(strings.TrimPrefix(r.URL.Path, "/api/v1/post/"), false)
	if idStr == "" {
		http.Error(w, `{"error": "ID not provided"}`, http.StatusBadRequest)
		return
	}
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		http.Error(w, `{"error": "Invalid ID format"}`, http.StatusBadRequest)
		return
	}
	offsetStr := sanitizeString(r.URL.Query().Get("offset"), false)
	offset, err := strconv.ParseInt(offsetStr, 10, 64)
	if err != nil {
		offset = 0
	}
	limitStr := sanitizeString(r.URL.Query().Get("limit"), false)
	limit, err := strconv.ParseInt(limitStr, 10, 64)
	if err != nil || limit > 10 {
		limit = 10
	}

	posts := make([]PostData, 0)
	findOptions := options.Find()
	findOptions.SetSort(bson.D{{Key: "_id", Value: -1}}).SetSkip(offset).SetLimit(limit)
	filter := bson.M{"profile_id": id}

	collection := client.Database(DBName).Collection("posts")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cursor, err := collection.Find(ctx, filter, findOptions)
	if err != nil {
		log.Printf("Cursor was unable to find entry based on index")
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var post PostData
		if err := cursor.Decode(&post); err != nil {
			log.Printf("Error decoding document: %v", err)
			continue
		}
		posts = append(posts, post)
	}

	writeJSON(w, posts)
}

// FeedPostsHandler retrieves paginated feed posts for the current user,
// supporting multiple feed tabs (For You, Following, Your Team).
func FeedPostsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getFeedPostsHandler(w, r)
		return
	case http.MethodPost:
		createFeedPostHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func getFeedPostsHandler(w http.ResponseWriter, r *http.Request) {
	feedMode := sanitizeString(r.URL.Query().Get("mode"), false)
	if feedMode != "following" {
		feedMode = "for_you"
	}

	limit := feedPostsLimitDefault
	limitStr := sanitizeString(r.URL.Query().Get("limit"), false)
	if limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	if limit > feedPostsLimitMax {
		limit = feedPostsLimitMax
	}

	excludedPostIDs, err := parseObjectIDsCSV(r.URL.Query().Get("exclude_ids"))
	if err != nil {
		http.Error(w, `{"error":"Invalid exclude_ids"}`, http.StatusBadRequest)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	blockedProfileIDs, err := getBlockedProfileIDsForProfile(ctx, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	followedProfileIDs := make([]primitive.ObjectID, 0)
	if feedMode == "following" {
		resolvedFollowedProfileIDs, lookupErr := getFollowedProfileIDsForProfile(ctx, currentProfile.Id)
		if lookupErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		followedProfileIDs = resolvedFollowedProfileIDs
		if len(followedProfileIDs) == 0 {
			writeJSON(w, []PostData{})
			return
		}

		if len(blockedProfileIDs) > 0 {
			blockedSet := make(map[primitive.ObjectID]struct{}, len(blockedProfileIDs))
			for _, blockedProfileID := range blockedProfileIDs {
				if blockedProfileID.IsZero() {
					continue
				}
				blockedSet[blockedProfileID] = struct{}{}
			}

			allowedFollowedIDs := make([]primitive.ObjectID, 0, len(followedProfileIDs))
			for _, followedProfileID := range followedProfileIDs {
				if followedProfileID.IsZero() {
					continue
				}
				if _, isBlocked := blockedSet[followedProfileID]; isBlocked {
					continue
				}
				allowedFollowedIDs = append(allowedFollowedIDs, followedProfileID)
			}
			followedProfileIDs = allowedFollowedIDs
			if len(followedProfileIDs) == 0 {
				writeJSON(w, []PostData{})
				return
			}
		}
	}

	viewedPostIDs := make([]primitive.ObjectID, 0)
	if EnableHideViewedPosts == true {
		resolvedViewedPostIDs, lookupErr := getViewedPostIDsForProfile(ctx, currentProfile.Id)
		if lookupErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		viewedPostIDs = resolvedViewedPostIDs
	}

	collection := client.Database(DBName).Collection("posts")
	loadPosts := func(filter bson.M) ([]PostData, error) {
		pipeline := mongo.Pipeline{}
		if len(filter) > 0 {
			pipeline = append(pipeline, bson.D{{Key: "$match", Value: filter}})
		}
		pipeline = append(pipeline, bson.D{{Key: "$sample", Value: bson.M{"size": limit}}})

		cursor, err := collection.Aggregate(ctx, pipeline)
		if err != nil {
			return nil, err
		}
		defer cursor.Close(ctx)

		posts := make([]PostData, 0, limit)
		for cursor.Next(ctx) {
			var post PostData
			if err := cursor.Decode(&post); err != nil {
				continue
			}
			posts = append(posts, post)
		}
		if err := cursor.Err(); err != nil {
			return nil, err
		}

		return posts, nil
	}

	primaryExcludedPostIDs := make([]primitive.ObjectID, 0, len(excludedPostIDs)+len(viewedPostIDs))
	excludedPostIDSet := make(map[primitive.ObjectID]struct{}, len(excludedPostIDs)+len(viewedPostIDs))
	for _, postID := range excludedPostIDs {
		if postID.IsZero() {
			continue
		}
		if _, exists := excludedPostIDSet[postID]; exists {
			continue
		}
		excludedPostIDSet[postID] = struct{}{}
		primaryExcludedPostIDs = append(primaryExcludedPostIDs, postID)
	}
	for _, postID := range viewedPostIDs {
		if postID.IsZero() {
			continue
		}
		if _, exists := excludedPostIDSet[postID]; exists {
			continue
		}
		excludedPostIDSet[postID] = struct{}{}
		primaryExcludedPostIDs = append(primaryExcludedPostIDs, postID)
	}

	buildPostFilter := func(excludedIDs []primitive.ObjectID, blockedIDs []primitive.ObjectID, mode string, followedIDs []primitive.ObjectID) bson.M {
		filter := bson.M{}
		if len(excludedIDs) > 0 {
			filter["_id"] = bson.M{
				"$nin": excludedIDs,
			}
		}
		if mode == "following" {
			filter["profile_id"] = bson.M{
				"$in": followedIDs,
			}
			return filter
		}
		if len(blockedIDs) > 0 {
			filter["profile_id"] = bson.M{
				"$nin": blockedIDs,
			}
		}
		return filter
	}

	primaryFilter := buildPostFilter(primaryExcludedPostIDs, blockedProfileIDs, feedMode, followedProfileIDs)
	posts, err := loadPosts(primaryFilter)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	if EnableHideViewedPosts == true && len(posts) == 0 && len(viewedPostIDs) > 0 {
		fallbackFilter := buildPostFilter(excludedPostIDs, blockedProfileIDs, feedMode, followedProfileIDs)
		posts, err = loadPosts(fallbackFilter)
		if err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, posts)
}

func parseObjectIDsCSV(value string) ([]primitive.ObjectID, error) {
	trimmedValue := strings.TrimSpace(value)
	if trimmedValue == "" {
		return []primitive.ObjectID{}, nil
	}

	parts := strings.Split(trimmedValue, ",")
	objectIDs := make([]primitive.ObjectID, 0, len(parts))
	seen := make(map[primitive.ObjectID]struct{}, len(parts))
	for _, part := range parts {
		trimmedPart := strings.TrimSpace(part)
		if trimmedPart == "" {
			continue
		}

		hexID := sanitizeString(trimmedPart, false)
		if hexID == "" {
			continue
		}
		if hexID != trimmedPart {
			return nil, errors.New("invalid object id token")
		}

		objectID, err := primitive.ObjectIDFromHex(hexID)
		if err != nil {
			return nil, err
		}
		if objectID.IsZero() {
			continue
		}
		if _, exists := seen[objectID]; exists {
			continue
		}

		seen[objectID] = struct{}{}
		objectIDs = append(objectIDs, objectID)
	}

	return objectIDs, nil
}

func getFollowedProfileIDsForProfile(ctx context.Context, profileID primitive.ObjectID) ([]primitive.ObjectID, error) {
	if profileID.IsZero() {
		return []primitive.ObjectID{}, nil
	}

	collection := client.Database(DBName).Collection("follows")
	cursor, err := collection.Find(
		ctx,
		bson.M{"profile_id": profileID},
		options.Find().SetProjection(bson.M{
			"rel_id": 1,
		}),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type followedEntry struct {
		RelID string `bson:"rel_id"`
	}

	followedProfileIDs := make([]primitive.ObjectID, 0)
	seen := make(map[primitive.ObjectID]struct{})
	for cursor.Next(ctx) {
		var entry followedEntry
		if decodeErr := cursor.Decode(&entry); decodeErr != nil {
			continue
		}

		relID := sanitizeString(entry.RelID, false)
		if relID == "" {
			continue
		}

		followedProfileID, parseErr := primitive.ObjectIDFromHex(relID)
		if parseErr != nil || followedProfileID.IsZero() {
			continue
		}
		if _, exists := seen[followedProfileID]; exists {
			continue
		}

		seen[followedProfileID] = struct{}{}
		followedProfileIDs = append(followedProfileIDs, followedProfileID)
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}

	return followedProfileIDs, nil
}

func getBlockedProfileIDsForProfile(ctx context.Context, profileID primitive.ObjectID) ([]primitive.ObjectID, error) {
	if profileID.IsZero() {
		return []primitive.ObjectID{}, nil
	}

	collection := client.Database(DBName).Collection("blocks")
	cursor, err := collection.Find(
		ctx,
		bson.M{"profile_id": profileID},
		options.Find().SetProjection(bson.M{
			"rel_id": 1,
		}),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type blockedEntry struct {
		RelID string `bson:"rel_id"`
	}

	blockedProfileIDs := make([]primitive.ObjectID, 0)
	seen := make(map[primitive.ObjectID]struct{})
	for cursor.Next(ctx) {
		var entry blockedEntry
		if decodeErr := cursor.Decode(&entry); decodeErr != nil {
			continue
		}

		relID := sanitizeString(entry.RelID, false)
		if relID == "" {
			continue
		}

		blockedProfileID, parseErr := primitive.ObjectIDFromHex(relID)
		if parseErr != nil || blockedProfileID.IsZero() {
			continue
		}
		if _, exists := seen[blockedProfileID]; exists {
			continue
		}

		seen[blockedProfileID] = struct{}{}
		blockedProfileIDs = append(blockedProfileIDs, blockedProfileID)
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}

	return blockedProfileIDs, nil
}

func createFeedPostHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}

	username := sanitizeString(currentProfile.Username, false)
	if username == "" {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unable to resolve profile for post"}`, http.StatusBadRequest)
		return
	}

	defer r.Body.Close()
	var req FeedPostCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	postText := sanitizeString(req.PostText, true)
	if postText == "" {
		http.Error(w, `{"error":"post_text is required"}`, http.StatusBadRequest)
		return
	}

	postTextRunes := []rune(postText)
	if len(postTextRunes) > feedPostTextMaxChars {
		postText = string(postTextRunes[:feedPostTextMaxChars])
	}

	attachments := sanitizePostAttachments(req.Attachments, feedPostMediaListMaxItems)

	firstName := sanitizeString(currentProfile.FirstName, true)
	if firstName == "" {
		firstName = username
	}
	lastName := sanitizeString(currentProfile.LastName, true)
	profilePictureURL := sanitizeString(currentProfile.ProfilePictureURL, true)

	post := PostData{
		Id:                primitive.NewObjectID(),
		ProfileID:         currentProfile.Id,
		RelID:             currentProfile.Id,
		Username:          username,
		FirstName:         firstName,
		LastName:          lastName,
		ProfilePictureURL: profilePictureURL,
		PostText:          postText,
		Attachments:       attachments,
		CreatedTime:       int(time.Now().Unix()),
		LikeCount:         0,
		CommentCount:      0,
		RepostCount:       0,
		ViewCount:         0,
		ShareCount:        0,
		SaveCount:         0,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	postsCollection := client.Database(DBName).Collection("posts")
	_, err := postsCollection.InsertOne(ctx, bson.M{
		"_id":                 post.Id,
		"profile_id":          post.ProfileID,
		"rel_id":              post.RelID,
		"username":            post.Username,
		"first_name":          post.FirstName,
		"last_name":           post.LastName,
		"profile_picture_url": post.ProfilePictureURL,
		"post_text":           post.PostText,
		"attachments":         post.Attachments,
		"created_time":        post.CreatedTime,
		"like_count":          post.LikeCount,
		"comment_count":       post.CommentCount,
		"repost_count":        post.RepostCount,
		"view_count":          post.ViewCount,
		"share_count":         post.ShareCount,
		"save_count":          post.SaveCount,
	})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, FeedPostCreateResponse{
		Message: "Post created",
		Post:    post,
	})
}

func postEditHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req PostEditRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	postIDHex := sanitizeString(req.PostID, false)
	if postIDHex == "" {
		http.Error(w, `{"error":"post_id is required"}`, http.StatusBadRequest)
		return
	}
	postID, err := primitive.ObjectIDFromHex(postIDHex)
	if err != nil {
		http.Error(w, `{"error":"Invalid post_id"}`, http.StatusBadRequest)
		return
	}

	postText := sanitizeString(req.PostText, true)
	if postText == "" {
		http.Error(w, `{"error":"post_text is required"}`, http.StatusBadRequest)
		return
	}
	postText = clampRunes(postText, feedPostTextMaxChars)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	post, err := resolvePostByID(ctx, postID)
	if err == mongo.ErrNoDocuments {
		http.Error(w, `{"error":"Post not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	if post.ProfileID != currentProfile.Id {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	postsCollection := client.Database(DBName).Collection("posts")
	updateResult, err := postsCollection.UpdateOne(
		ctx,
		bson.M{
			"_id":        postID,
			"profile_id": currentProfile.Id,
		},
		bson.M{
			"$set": bson.M{
				"post_text": postText,
			},
		},
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if updateResult.MatchedCount == 0 {
		http.Error(w, `{"error":"Post not found"}`, http.StatusNotFound)
		return
	}

	post.PostText = postText
	writeJSON(w, PostEditResponse{
		Message: "Post updated",
		Post:    post,
	})
}

func postDeleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req PostDeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	postIDHex := sanitizeString(req.PostID, false)
	if postIDHex == "" {
		http.Error(w, `{"error":"post_id is required"}`, http.StatusBadRequest)
		return
	}
	postID, err := primitive.ObjectIDFromHex(postIDHex)
	if err != nil {
		http.Error(w, `{"error":"Invalid post_id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	post, err := resolvePostByID(ctx, postID)
	if err == mongo.ErrNoDocuments {
		http.Error(w, `{"error":"Post not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	if post.ProfileID != currentProfile.Id {
		http.Error(w, `{"error":"Forbidden"}`, http.StatusForbidden)
		return
	}

	postsCollection := client.Database(DBName).Collection("posts")
	deleteResult, err := postsCollection.DeleteOne(
		ctx,
		bson.M{
			"_id":        postID,
			"profile_id": currentProfile.Id,
		},
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if deleteResult.DeletedCount == 0 {
		http.Error(w, `{"error":"Post not found"}`, http.StatusNotFound)
		return
	}

	cleanupCollections := []string{"likes", "comments", "post_views", "shares", "reposts", "saves"}
	for _, collectionName := range cleanupCollections {
		_, cleanupErr := client.Database(DBName).Collection(collectionName).DeleteMany(
			ctx,
			bson.M{"rel_id": postIDHex},
		)
		if cleanupErr != nil {
			log.Printf("post cleanup failed for %s/%s: %v", collectionName, postIDHex, cleanupErr)
		}
	}

	writeJSON(w, PostDeleteResponse{
		PostID:  postIDHex,
		Message: "Post deleted",
	})
}

func resolvePostByID(ctx context.Context, postID primitive.ObjectID) (PostData, error) {
	post := PostData{}
	if postID.IsZero() {
		return post, mongo.ErrNoDocuments
	}

	err := client.Database(DBName).Collection("posts").FindOne(
		ctx,
		bson.M{"_id": postID},
	).Decode(&post)
	return post, err
}

func postViewHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}

	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	viewAdded, err := addInteractionIfNew(ctx, "post_views", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if viewAdded {
		if err := adjustPostActionCount(ctx, relID, "view_count", 1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, PostViewResponse{
		RelID:    relID,
		IsViewed: true,
	})
}

func getViewedPostIDsForProfile(ctx context.Context, profileID primitive.ObjectID) ([]primitive.ObjectID, error) {
	if profileID.IsZero() {
		return []primitive.ObjectID{}, nil
	}

	collection := client.Database(DBName).Collection("post_views")
	cursor, err := collection.Find(
		ctx,
		bson.M{"profile_id": profileID},
		options.Find().
			SetProjection(bson.M{"rel_id": 1}).
			SetLimit(viewedPostLookupLimit),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type viewedPostLookupEntry struct {
		RelID string `bson:"rel_id"`
	}

	viewedPostIDs := make([]primitive.ObjectID, 0)
	seen := make(map[primitive.ObjectID]struct{})
	for cursor.Next(ctx) {
		var entry viewedPostLookupEntry
		if decodeErr := cursor.Decode(&entry); decodeErr != nil {
			continue
		}
		relID := sanitizeString(entry.RelID, false)
		if relID == "" {
			continue
		}

		postID, parseErr := primitive.ObjectIDFromHex(relID)
		if parseErr != nil || postID.IsZero() {
			continue
		}
		if _, exists := seen[postID]; exists {
			continue
		}

		seen[postID] = struct{}{}
		viewedPostIDs = append(viewedPostIDs, postID)
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}

	return viewedPostIDs, nil
}

func GetRecruitHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := recruitListLimitDefault
	limitStr := sanitizeString(r.URL.Query().Get("limit"), false)
	if limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	if limit > recruitListLimitMax {
		limit = recruitListLimitMax
	}

	findOptions := options.Find().
		SetSort(bson.D{{Key: "name", Value: 1}, {Key: "_id", Value: 1}}).
		SetLimit(int64(limit))

	collection := client.Database(DBName).Collection("recruits")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cursor, err := collection.Find(ctx, bson.M{}, findOptions)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	recruits := make([]RecruitData, 0, limit)
	for cursor.Next(ctx) {
		var recruit RecruitData
		if err := cursor.Decode(&recruit); err != nil {
			continue
		}
		recruits = append(recruits, recruit)
	}
	if err := cursor.Err(); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, recruits)
}

func MarketplaceHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getMarketplaceListingsHandler(w, r)
		return
	case http.MethodPost:
		createMarketplaceListingHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func getMarketplaceListingsHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	limit := marketplaceListLimitDefault
	limitStr := sanitizeString(r.URL.Query().Get("limit"), false)
	if limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	if limit > marketplaceListLimitMax {
		limit = marketplaceListLimitMax
	}

	query := sanitizeString(r.URL.Query().Get("query"), true)
	filter := bson.M{}
	if query != "" {
		escapedQuery := regexp.QuoteMeta(query)
		queryRegex := primitive.Regex{
			Pattern: escapedQuery,
			Options: "i",
		}
		filter = bson.M{
			"$or": bson.A{
				bson.M{"title": queryRegex},
				bson.M{"description": queryRegex},
				bson.M{"location": queryRegex},
				bson.M{"category": queryRegex},
				bson.M{"condition": queryRegex},
			},
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	blockedProfileIDs, err := getBlockedProfileIDsForProfile(ctx, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if len(blockedProfileIDs) > 0 {
		filter["profile_id"] = bson.M{"$nin": blockedProfileIDs}
	}

	collection := client.Database(DBName).Collection("marketplace_listings")
	findOptions := options.Find().
		SetSort(bson.D{{Key: "created_time", Value: -1}, {Key: "_id", Value: -1}}).
		SetLimit(int64(limit))
	cursor, err := collection.Find(ctx, filter, findOptions)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	entries := make([]MarketplaceListingEntry, 0, limit)
	sellerProfileIDs := make([]primitive.ObjectID, 0, limit)
	seenSellerProfiles := make(map[primitive.ObjectID]struct{})
	for cursor.Next(ctx) {
		var entry MarketplaceListingEntry
		if err := cursor.Decode(&entry); err != nil {
			continue
		}
		if entry.ProfileID.IsZero() {
			continue
		}

		entries = append(entries, entry)
		if _, exists := seenSellerProfiles[entry.ProfileID]; exists {
			continue
		}
		seenSellerProfiles[entry.ProfileID] = struct{}{}
		sellerProfileIDs = append(sellerProfileIDs, entry.ProfileID)
	}
	if err := cursor.Err(); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	profileLookupMap := make(map[string]marketplaceProfileLookup, len(sellerProfileIDs))
	if len(sellerProfileIDs) > 0 {
		profilesCursor, findProfilesErr := client.Database(DBName).Collection("profiles").Find(
			ctx,
			bson.M{"_id": bson.M{"$in": sellerProfileIDs}},
			options.Find().SetProjection(bson.M{
				"username":   1,
				"first_name": 1,
				"last_name":  1,
			}),
		)
		if findProfilesErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		defer profilesCursor.Close(ctx)

		for profilesCursor.Next(ctx) {
			var profileLookup marketplaceProfileLookup
			if decodeErr := profilesCursor.Decode(&profileLookup); decodeErr != nil {
				continue
			}
			if profileLookup.Id.IsZero() {
				continue
			}
			profileLookupMap[profileLookup.Id.Hex()] = profileLookup
		}
		if err := profilesCursor.Err(); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	listings := make([]MarketplaceListingData, 0, len(entries))
	for _, entry := range entries {
		listingData := marketplaceListingEntryToData(entry, profileLookupMap)
		if listingData.Title == "" || listingData.Location == "" || listingData.Description == "" {
			continue
		}
		listings = append(listings, listingData)
	}

	writeJSON(w, MarketplaceListingListResponse{
		Query:    query,
		Listings: listings,
	})
}

func createMarketplaceListingHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req MarketplaceCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	title := sanitizeString(req.Title, true)
	description := sanitizeString(req.Description, true)
	location := sanitizeString(req.Location, true)
	category := sanitizeString(req.Category, true)
	condition := sanitizeString(req.Condition, true)
	imageURL := sanitizeString(req.ImageURL, true)
	imageURLs := normalizeMarketplaceImageURLs(req.ImageURLs)
	currency := sanitizeString(req.Currency, false)
	price := req.Price

	if title == "" || description == "" || location == "" || category == "" || condition == "" {
		http.Error(w, `{"error":"All listing fields are required"}`, http.StatusBadRequest)
		return
	}

	if price < 0 {
		price = 0
	}

	if currency == "" {
		currency = "CAD"
	}

	title = clampRunes(title, marketplaceFieldMaxChars)
	description = clampRunes(description, marketplaceDescriptionMaxChars)
	location = clampRunes(location, marketplaceFieldMaxChars)
	category = clampRunes(category, marketplaceFieldMaxChars)
	condition = clampRunes(condition, marketplaceFieldMaxChars)
	currency = clampRunes(currency, 8)
	imageURL = clampRunes(imageURL, marketplaceDescriptionMaxChars)
	if imageURL != "" && len(imageURLs) == 0 {
		imageURLs = append(imageURLs, imageURL)
	}
	if len(imageURLs) > 0 {
		imageURL = imageURLs[0]
	}

	entry := MarketplaceListingEntry{
		Id:          primitive.NewObjectID(),
		ProfileID:   currentProfile.Id,
		Title:       title,
		Description: description,
		Price:       price,
		Currency:    currency,
		Location:    location,
		Category:    category,
		Condition:   condition,
		ImageURL:    imageURL,
		ImageURLs:   imageURLs,
		CreatedTime: time.Now().Unix(),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := client.Database(DBName).Collection("marketplace_listings").InsertOne(ctx, entry)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	listingData := marketplaceListingEntryToData(entry, map[string]marketplaceProfileLookup{
		currentProfile.Id.Hex(): {
			Id:        currentProfile.Id,
			Username:  currentProfile.Username,
			FirstName: currentProfile.FirstName,
			LastName:  currentProfile.LastName,
		},
	})

	writeJSON(w, MarketplaceCreateResponse{
		Message: "Listing created",
		Listing: listingData,
	})
}

type marketplaceProfileLookup struct {
	Id        primitive.ObjectID `bson:"_id"`
	Username  string             `bson:"username"`
	FirstName string             `bson:"first_name"`
	LastName  string             `bson:"last_name"`
}

func marketplaceListingEntryToData(
	entry MarketplaceListingEntry,
	profileLookupMap map[string]marketplaceProfileLookup,
) MarketplaceListingData {
	listingID := ""
	if !entry.Id.IsZero() {
		listingID = entry.Id.Hex()
	}

	profileID := ""
	if !entry.ProfileID.IsZero() {
		profileID = entry.ProfileID.Hex()
	}

	profileLookup := marketplaceProfileLookup{}
	if profileID != "" {
		resolvedProfileLookup, exists := profileLookupMap[profileID]
		if exists {
			profileLookup = resolvedProfileLookup
		}
	}

	price := entry.Price
	if price < 0 {
		price = 0
	}

	createdTime := entry.CreatedTime
	if createdTime < 0 {
		createdTime = 0
	}

	return MarketplaceListingData{
		Id:              listingID,
		ProfileID:       profileID,
		SellerUsername:  sanitizeString(profileLookup.Username, false),
		SellerFirstName: sanitizeString(profileLookup.FirstName, true),
		SellerLastName:  sanitizeString(profileLookup.LastName, true),
		Title:           sanitizeString(entry.Title, true),
		Description:     sanitizeString(entry.Description, true),
		Price:           price,
		Currency:        sanitizeString(entry.Currency, false),
		Location:        sanitizeString(entry.Location, true),
		Category:        sanitizeString(entry.Category, true),
		Condition:       sanitizeString(entry.Condition, true),
		ImageURL:        sanitizeString(entry.ImageURL, true),
		ImageURLs:       marketplaceListingImageURLs(entry.ImageURL, entry.ImageURLs),
		CreatedTime:     createdTime,
	}
}

func marketplaceListingImageURLs(primaryImageURL string, imageURLs []string) []string {
	normalizedImageURLs := normalizeMarketplaceImageURLs(imageURLs)
	primary := clampRunes(sanitizeString(primaryImageURL, true), marketplaceDescriptionMaxChars)
	if primary == "" {
		return normalizedImageURLs
	}
	if len(normalizedImageURLs) == 0 {
		return []string{primary}
	}
	for _, imageURL := range normalizedImageURLs {
		if imageURL == primary {
			return normalizedImageURLs
		}
	}
	return append([]string{primary}, normalizedImageURLs...)
}

func normalizeMarketplaceImageURLs(imageURLs []string) []string {
	if len(imageURLs) == 0 {
		return []string{}
	}

	normalizedImageURLs := make([]string, 0, len(imageURLs))
	seen := make(map[string]struct{}, len(imageURLs))
	for _, rawImageURL := range imageURLs {
		imageURL := clampRunes(sanitizeString(rawImageURL, true), marketplaceDescriptionMaxChars)
		if imageURL == "" {
			continue
		}
		if _, exists := seen[imageURL]; exists {
			continue
		}
		seen[imageURL] = struct{}{}
		normalizedImageURLs = append(normalizedImageURLs, imageURL)
		if len(normalizedImageURLs) >= 12 {
			break
		}
	}

	return normalizedImageURLs
}

func EventHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getEventsHandler(w, r)
		return
	case http.MethodPost:
		createEventHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func getEventsHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}

	limit := eventListLimitDefault
	limitStr := sanitizeString(r.URL.Query().Get("limit"), false)
	if limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	if limit > eventListLimitMax {
		limit = eventListLimitMax
	}

	query := sanitizeString(r.URL.Query().Get("query"), true)
	filter := bson.M{}
	if query != "" {
		escapedQuery := regexp.QuoteMeta(query)
		queryRegex := primitive.Regex{
			Pattern: escapedQuery,
			Options: "i",
		}
		filter = bson.M{
			"$or": bson.A{
				bson.M{"event_title": queryRegex},
				bson.M{"location": queryRegex},
				bson.M{"team": queryRegex},
				bson.M{"event_description": queryRegex},
				bson.M{"contact_name": queryRegex},
				bson.M{"contact_email": queryRegex},
				bson.M{"contact_phone": queryRegex},
				bson.M{"date": queryRegex},
				bson.M{"time": queryRegex},
			},
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	collection := client.Database(DBName).Collection("events")
	findOptions := options.Find().
		SetSort(bson.D{{Key: "_id", Value: -1}}).
		SetLimit(int64(limit))
	cursor, err := collection.Find(ctx, filter, findOptions)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	events := make([]EventData, 0, limit)
	eventIDs := make([]primitive.ObjectID, 0, limit)
	for cursor.Next(ctx) {
		var entry EventEntry
		if err := cursor.Decode(&entry); err != nil {
			continue
		}
		eventData := eventEntryToData(entry)
		if eventData.Location == "" || eventData.Time == "" || eventData.Date == "" || eventData.Team == "" || eventData.EventTitle == "" || eventData.EventDescription == "" {
			continue
		}
		events = append(events, eventData)
		if !entry.Id.IsZero() {
			eventIDs = append(eventIDs, entry.Id)
		}
	}
	if err := cursor.Err(); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	eventRsvpStates, err := findEventRsvpStates(ctx, eventIDs, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	for i := range events {
		eventID := sanitizeString(events[i].Id, false)
		if eventID == "" {
			continue
		}
		events[i].IsRsvped = eventRsvpStates[eventID]
	}

	writeJSON(w, EventListResponse{
		Query:  query,
		Events: events,
	})
}

func createEventHandler(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req EventCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	location := sanitizeString(req.Location, true)
	eventTime := sanitizeString(req.Time, true)
	eventDate := sanitizeString(req.Date, true)
	team := sanitizeString(req.Team, true)
	eventImage := sanitizeString(req.EventImage, true)
	eventTitle := sanitizeString(req.EventTitle, true)
	eventDescription := sanitizeString(req.EventDescription, true)
	contactName := sanitizeString(req.ContactName, true)
	contactEmail := sanitizeString(req.ContactEmail, true)
	contactPhone := sanitizeString(req.ContactPhone, true)

	if location == "" || eventTime == "" || eventDate == "" || team == "" || eventImage == "" || eventTitle == "" || eventDescription == "" {
		http.Error(w, `{"error":"All event fields are required"}`, http.StatusBadRequest)
		return
	}

	location = clampRunes(location, eventFieldMaxChars)
	eventTime = clampRunes(eventTime, eventFieldMaxChars)
	eventDate = clampRunes(eventDate, eventFieldMaxChars)
	team = clampRunes(team, eventFieldMaxChars)
	eventImage = clampRunes(eventImage, eventDescriptionMaxChars)
	eventTitle = clampRunes(eventTitle, eventFieldMaxChars)
	eventDescription = clampRunes(eventDescription, eventDescriptionMaxChars)
	contactName = clampRunes(contactName, eventFieldMaxChars)
	contactEmail = clampRunes(contactEmail, eventFieldMaxChars)
	contactPhone = clampRunes(contactPhone, eventFieldMaxChars)

	entry := EventEntry{
		Id:               primitive.NewObjectID(),
		Location:         location,
		Time:             eventTime,
		Date:             eventDate,
		Team:             team,
		EventImage:       eventImage,
		EventTitle:       eventTitle,
		EventDescription: eventDescription,
		ContactName:      contactName,
		ContactEmail:     contactEmail,
		ContactPhone:     contactPhone,
		RsvpCount:        0,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := client.Database(DBName).Collection("events").InsertOne(ctx, entry)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, EventCreateResponse{
		Message: "Event created",
		Event:   eventEntryToData(entry),
	})
}

func eventRsvpHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req EventRSVPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	eventIDHex := sanitizeString(req.EventID, false)
	if eventIDHex == "" {
		http.Error(w, `{"error":"event_id is required"}`, http.StatusBadRequest)
		return
	}

	eventID, err := primitive.ObjectIDFromHex(eventIDHex)
	if err != nil {
		http.Error(w, `{"error":"Invalid event_id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	eventsCollection := client.Database(DBName).Collection("events")
	findErr := eventsCollection.FindOne(ctx, bson.M{"_id": eventID}).Err()
	if findErr == mongo.ErrNoDocuments {
		http.Error(w, `{"error":"Event not found"}`, http.StatusNotFound)
		return
	}
	if findErr != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	eventRsvpsCollection := client.Database(DBName).Collection("event_rsvps")
	eventFilter := bson.M{
		"event_id":   eventID,
		"profile_id": currentProfile.Id,
	}

	isRsvped := false
	delta := 0
	existingErr := eventRsvpsCollection.FindOne(ctx, eventFilter).Err()
	if existingErr == nil {
		deleteResult, deleteErr := eventRsvpsCollection.DeleteOne(ctx, eventFilter)
		err = deleteErr
		if err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if deleteResult.DeletedCount > 0 {
			delta = -1
		}
	} else if existingErr == mongo.ErrNoDocuments {
		isRsvped = true
		updateResult, updateErr := eventRsvpsCollection.UpdateOne(
			ctx,
			eventFilter,
			bson.M{
				"$set": bson.M{
					"time": time.Now().Unix(),
				},
				"$setOnInsert": bson.M{
					"event_id":   eventID,
					"profile_id": currentProfile.Id,
				},
			},
			options.Update().SetUpsert(true),
		)
		err = updateErr
		if err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if updateResult.UpsertedCount > 0 {
			delta = 1
		}
	} else {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	rsvpCount, err := adjustEventRsvpCount(ctx, eventID, delta)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, `{"error":"Event not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, EventRSVPResponse{
		EventID:   eventID.Hex(),
		IsRsvped:  isRsvped,
		RsvpCount: rsvpCount,
	})
}

func adjustEventRsvpCount(ctx context.Context, eventID primitive.ObjectID, delta int) (int, error) {
	if eventID.IsZero() {
		return 0, mongo.ErrNoDocuments
	}

	eventsCollection := client.Database(DBName).Collection("events")
	if delta != 0 {
		_, err := eventsCollection.UpdateOne(
			ctx,
			bson.M{"_id": eventID},
			bson.M{
				"$inc": bson.M{
					"rsvp_count": delta,
				},
			},
		)
		if err != nil {
			return 0, err
		}
	}

	if delta < 0 {
		_, err := eventsCollection.UpdateOne(
			ctx,
			bson.M{
				"_id":        eventID,
				"rsvp_count": bson.M{"$lt": 0},
			},
			bson.M{
				"$set": bson.M{
					"rsvp_count": 0,
				},
			},
		)
		if err != nil {
			return 0, err
		}
	}

	type eventRSVPCountLookup struct {
		RsvpCount int `bson:"rsvp_count"`
	}

	var lookup eventRSVPCountLookup
	err := eventsCollection.FindOne(
		ctx,
		bson.M{"_id": eventID},
		options.FindOne().SetProjection(bson.M{
			"rsvp_count": 1,
		}),
	).Decode(&lookup)
	if err != nil {
		return 0, err
	}
	if lookup.RsvpCount < 0 {
		return 0, nil
	}

	return lookup.RsvpCount, nil
}

func profileEventsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}

	profileIDHex := sanitizeString(r.URL.Query().Get("profile_id"), false)
	if profileIDHex == "" {
		http.Error(w, `{"error":"profile_id is required"}`, http.StatusBadRequest)
		return
	}

	profileID, err := primitive.ObjectIDFromHex(profileIDHex)
	if err != nil {
		http.Error(w, `{"error":"Invalid profile_id"}`, http.StatusBadRequest)
		return
	}

	limit := profileEventListLimitDefault
	limitStr := sanitizeString(r.URL.Query().Get("limit"), false)
	if limitStr != "" {
		parsedLimit, parseErr := strconv.Atoi(limitStr)
		if parseErr == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	if limit > profileEventListLimitMax {
		limit = profileEventListLimitMax
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	eventRsvpsCollection := client.Database(DBName).Collection("event_rsvps")
	findOptions := options.Find().
		SetSort(bson.D{{Key: "time", Value: -1}, {Key: "event_id", Value: 1}}).
		SetLimit(int64(limit)).
		SetProjection(bson.M{"event_id": 1})
	cursor, err := eventRsvpsCollection.Find(ctx, bson.M{"profile_id": profileID}, findOptions)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	type profileRsvpLookupEntry struct {
		EventID primitive.ObjectID `bson:"event_id"`
	}

	orderedEventIDs := make([]primitive.ObjectID, 0, limit)
	seenEventIDs := make(map[primitive.ObjectID]struct{})
	for cursor.Next(ctx) {
		var entry profileRsvpLookupEntry
		if decodeErr := cursor.Decode(&entry); decodeErr != nil {
			continue
		}
		if entry.EventID.IsZero() {
			continue
		}
		if _, exists := seenEventIDs[entry.EventID]; exists {
			continue
		}
		seenEventIDs[entry.EventID] = struct{}{}
		orderedEventIDs = append(orderedEventIDs, entry.EventID)
	}
	if err := cursor.Err(); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	response := ProfileEventListResponse{
		ProfileID: profileID.Hex(),
		Events:    []EventData{},
	}
	if len(orderedEventIDs) == 0 {
		writeJSON(w, response)
		return
	}

	eventsCollection := client.Database(DBName).Collection("events")
	eventsCursor, err := eventsCollection.Find(
		ctx,
		bson.M{"_id": bson.M{"$in": orderedEventIDs}},
		options.Find().SetProjection(bson.M{
			"location":          1,
			"time":              1,
			"date":              1,
			"team":              1,
			"event_image":       1,
			"event_title":       1,
			"event_description": 1,
			"contact_name":      1,
			"contact_email":     1,
			"contact_phone":     1,
			"rsvp_count":        1,
		}),
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer eventsCursor.Close(ctx)

	eventsByID := make(map[primitive.ObjectID]EventEntry, len(orderedEventIDs))
	for eventsCursor.Next(ctx) {
		var entry EventEntry
		if decodeErr := eventsCursor.Decode(&entry); decodeErr != nil {
			continue
		}
		if entry.Id.IsZero() {
			continue
		}
		eventsByID[entry.Id] = entry
	}
	if err := eventsCursor.Err(); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	viewerRsvpMap, err := findEventRsvpStates(ctx, orderedEventIDs, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	events := make([]EventData, 0, len(orderedEventIDs))
	for _, eventID := range orderedEventIDs {
		entry, exists := eventsByID[eventID]
		if !exists {
			continue
		}

		eventData := eventEntryToData(entry)
		eventData.IsRsvped = viewerRsvpMap[eventData.Id]
		events = append(events, eventData)
	}

	response.Events = events
	writeJSON(w, response)
}

func eventEntryToData(entry EventEntry) EventData {
	eventID := ""
	if !entry.Id.IsZero() {
		eventID = entry.Id.Hex()
	}

	rsvpCount := entry.RsvpCount
	if rsvpCount < 0 {
		rsvpCount = 0
	}

	return EventData{
		Id:               eventID,
		Location:         sanitizeString(entry.Location, true),
		Time:             sanitizeString(entry.Time, true),
		Date:             sanitizeString(entry.Date, true),
		Team:             sanitizeString(entry.Team, true),
		EventImage:       sanitizeString(entry.EventImage, true),
		EventTitle:       sanitizeString(entry.EventTitle, true),
		EventDescription: sanitizeString(entry.EventDescription, true),
		ContactName:      sanitizeString(entry.ContactName, true),
		ContactEmail:     sanitizeString(entry.ContactEmail, true),
		ContactPhone:     sanitizeString(entry.ContactPhone, true),
		RsvpCount:        rsvpCount,
		IsRsvped:         false,
	}
}

func storyHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getStoriesHandler(w, r)
		return
	case http.MethodPost:
		createStoryHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func getStoriesHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}

	profileID := currentProfile.Id
	profileIDHex := sanitizeString(r.URL.Query().Get("profile_id"), false)
	if profileIDHex != "" {
		parsedProfileID, err := primitive.ObjectIDFromHex(profileIDHex)
		if err != nil || parsedProfileID.IsZero() {
			http.Error(w, `{"error":"Invalid profile_id"}`, http.StatusBadRequest)
			return
		}
		profileID = parsedProfileID
	}
	if profileID.IsZero() {
		http.Error(w, `{"error":"profile_id is required"}`, http.StatusBadRequest)
		return
	}

	limit := storyListLimitDefault
	limitStr := sanitizeString(r.URL.Query().Get("limit"), false)
	if limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	if limit > storyListLimitMax {
		limit = storyListLimitMax
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now().Unix()
	cursor, err := client.Database(DBName).Collection("stories").Find(
		ctx,
		bson.M{
			"profile_id":  profileID,
			"expiry_time": bson.M{"$gt": now},
		},
		options.Find().
			SetSort(bson.D{{Key: "created_time", Value: -1}, {Key: "_id", Value: -1}}).
			SetLimit(int64(limit)),
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	stories := make([]StoryData, 0, limit)
	for cursor.Next(ctx) {
		var entry StoryEntry
		if decodeErr := cursor.Decode(&entry); decodeErr != nil {
			continue
		}
		stories = append(stories, storyEntryToData(entry))
	}
	if err := cursor.Err(); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, StoryListResponse{
		ProfileID:      profileID.Hex(),
		HasActiveStory: len(stories) > 0,
		Stories:        stories,
	})
}

func createStoryHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req StoryCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	storyText := sanitizeString(req.StoryText, true)
	storyMediaURL := sanitizeString(req.StoryMediaURL, true)
	if storyText == "" && storyMediaURL == "" {
		http.Error(w, `{"error":"story_text or story_media_url is required"}`, http.StatusBadRequest)
		return
	}

	storyText = clampRunes(storyText, storyTextMaxChars)
	storyMediaURL = clampRunes(storyMediaURL, storyMediaURLMaxChars)

	now := time.Now().Unix()
	entry := StoryEntry{
		Id:            primitive.NewObjectID(),
		ProfileID:     currentProfile.Id,
		StoryText:     storyText,
		StoryMediaURL: storyMediaURL,
		CreatedTime:   now,
		ExpiryTime:    now + storyExpiryDurationSeconds,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := client.Database(DBName).Collection("stories").InsertOne(
		ctx,
		bson.M{
			"_id":             entry.Id,
			"profile_id":      entry.ProfileID,
			"story_text":      entry.StoryText,
			"story_media_url": entry.StoryMediaURL,
			"created_time":    entry.CreatedTime,
			"expiry_time":     entry.ExpiryTime,
		},
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, StoryCreateResponse{
		Message: "Story created",
		Story:   storyEntryToData(entry),
	})
}

func storyEntryToData(entry StoryEntry) StoryData {
	storyID := ""
	if !entry.Id.IsZero() {
		storyID = entry.Id.Hex()
	}

	profileID := ""
	if !entry.ProfileID.IsZero() {
		profileID = entry.ProfileID.Hex()
	}

	return StoryData{
		Id:            storyID,
		ProfileID:     profileID,
		StoryText:     sanitizeString(entry.StoryText, true),
		StoryMediaURL: sanitizeString(entry.StoryMediaURL, true),
		CreatedTime:   entry.CreatedTime,
		ExpiryTime:    entry.ExpiryTime,
	}
}

func hasActiveStoryForProfile(ctx context.Context, profileID primitive.ObjectID) (bool, error) {
	if profileID.IsZero() {
		return false, nil
	}

	err := client.Database(DBName).Collection("stories").FindOne(
		ctx,
		bson.M{
			"profile_id":  profileID,
			"expiry_time": bson.M{"$gt": time.Now().Unix()},
		},
		options.FindOne().SetProjection(bson.M{"_id": 1}),
	).Err()
	if err == mongo.ErrNoDocuments {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	return true, nil
}

// startStoryExpiryGarbageCollector starts a background goroutine that periodically
// deletes expired story documents from the stories MongoDB collection.
// Stories expire 24 hours after creation.
func startStoryExpiryGarbageCollector() {
	if client == nil {
		return
	}

	cleanupStories := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		deleteResult, err := client.Database(DBName).Collection("stories").DeleteMany(
			ctx,
			bson.M{
				"expiry_time": bson.M{"$lte": time.Now().Unix()},
			},
		)
		if err != nil {
			log.Printf("story garbage collector error: %v", err)
			return
		}
		if deleteResult.DeletedCount > 0 {
			log.Printf("story garbage collector removed %d expired stories", deleteResult.DeletedCount)
		}
	}

	cleanupStories()

	go func() {
		ticker := time.NewTicker(storyCleanupInterval)
		defer ticker.Stop()

		for range ticker.C {
			cleanupStories()
		}
	}()
}

func clampRunes(value string, maxLength int) string {
	if maxLength <= 0 {
		return ""
	}

	runeValue := []rune(value)
	if len(runeValue) <= maxLength {
		return value
	}
	return string(runeValue[:maxLength])
}

func sanitizePostAttachments(rawAttachments []FeedPostCreateAttachmentRequest, maxItems int) []PostAttachment {
	if maxItems <= 0 || len(rawAttachments) == 0 {
		return []PostAttachment{}
	}

	sanitizedAttachments := make([]PostAttachment, 0, maxItems)
	seenKeys := make(map[string]struct{}, len(rawAttachments))

	for _, rawAttachment := range rawAttachments {
		if len(sanitizedAttachments) >= maxItems {
			break
		}

		attachmentType := strings.ToLower(sanitizeString(rawAttachment.Type, false))
		if attachmentType != "image" && attachmentType != "video" {
			continue
		}

		attachmentURL := clampRunes(sanitizeString(rawAttachment.URL, true), feedPostMediaURLMaxChars)
		if attachmentURL == "" {
			continue
		}

		lowerURL := strings.ToLower(attachmentURL)
		if strings.HasPrefix(lowerURL, "http://") == false && strings.HasPrefix(lowerURL, "https://") == false {
			continue
		}

		seenKey := attachmentType + "|" + attachmentURL
		if _, exists := seenKeys[seenKey]; exists {
			continue
		}
		seenKeys[seenKey] = struct{}{}

		sanitizedAttachments = append(sanitizedAttachments, PostAttachment{
			Type: attachmentType,
			URL:  attachmentURL,
		})
	}

	return sanitizedAttachments
}

func findEventRsvpStates(ctx context.Context, eventIDs []primitive.ObjectID, profileID primitive.ObjectID) (map[string]bool, error) {
	stateMap := make(map[string]bool)
	if profileID.IsZero() || len(eventIDs) == 0 {
		return stateMap, nil
	}

	seenEventIDs := make(map[primitive.ObjectID]struct{}, len(eventIDs))
	sanitizedEventIDs := make([]primitive.ObjectID, 0, len(eventIDs))
	for _, eventID := range eventIDs {
		if eventID.IsZero() {
			continue
		}
		if _, exists := seenEventIDs[eventID]; exists {
			continue
		}
		seenEventIDs[eventID] = struct{}{}
		sanitizedEventIDs = append(sanitizedEventIDs, eventID)
		stateMap[eventID.Hex()] = false
	}
	if len(sanitizedEventIDs) == 0 {
		return stateMap, nil
	}

	eventRsvpsCollection := client.Database(DBName).Collection("event_rsvps")
	cursor, err := eventRsvpsCollection.Find(
		ctx,
		bson.M{
			"profile_id": profileID,
			"event_id":   bson.M{"$in": sanitizedEventIDs},
		},
		options.Find().SetProjection(bson.M{"event_id": 1}),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type eventRsvpStateEntry struct {
		EventID primitive.ObjectID `bson:"event_id"`
	}

	for cursor.Next(ctx) {
		var entry eventRsvpStateEntry
		if decodeErr := cursor.Decode(&entry); decodeErr != nil {
			continue
		}
		if entry.EventID.IsZero() {
			continue
		}
		eventIDHex := entry.EventID.Hex()
		if _, exists := stateMap[eventIDHex]; exists {
			stateMap[eventIDHex] = true
		}
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}

	return stateMap, nil
}

func likeHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getLikeStateHandler(w, r)
		return
	case http.MethodPost:
		toggleLikeHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func shareHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getShareStateHandler(w, r)
		return
	case http.MethodPost:
		toggleShareHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func repostHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getRepostStateHandler(w, r)
		return
	case http.MethodPost:
		toggleRepostHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func saveHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getSaveStateHandler(w, r)
		return
	case http.MethodPost:
		toggleSaveHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func followHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getFollowStateHandler(w, r)
		return
	case http.MethodPost:
		toggleFollowHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func commentHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getCommentsHandler(w, r)
		return
	case http.MethodPost:
		createCommentHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func getCommentsHandler(w http.ResponseWriter, r *http.Request) {
	if _, ok := getCurrentSessionProfile(w, r); !ok {
		return
	}

	relID := sanitizeString(r.URL.Query().Get("rel_id"), false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}

	limit := commentListLimitDefault
	limitStr := sanitizeString(r.URL.Query().Get("limit"), false)
	if limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	if limit > commentListLimitMax {
		limit = commentListLimitMax
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	collection := client.Database(DBName).Collection("comments")
	findOptions := options.Find().
		SetSort(bson.D{{Key: "time", Value: 1}, {Key: "_id", Value: 1}}).
		SetLimit(int64(limit))
	cursor, err := collection.Find(ctx, bson.M{"rel_id": relID}, findOptions)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	commentEntries := make([]CommentEntry, 0)
	profileIDs := make([]primitive.ObjectID, 0)
	for cursor.Next(ctx) {
		var entry CommentEntry
		if decodeErr := cursor.Decode(&entry); decodeErr != nil {
			continue
		}
		if entry.AuthorProfileID.IsZero() {
			continue
		}

		commentEntries = append(commentEntries, entry)
		profileIDs = append(profileIDs, entry.AuthorProfileID)
	}
	if err := cursor.Err(); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	profilesByID, err := getProfileLookupByIDs(ctx, profileIDs)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	comments := make([]CommentData, 0, len(commentEntries))
	for _, entry := range commentEntries {
		commentID := ""
		if !entry.ID.IsZero() {
			commentID = entry.ID.Hex()
		}

		commentRelID := sanitizeString(entry.RelID, false)
		if commentRelID == "" {
			commentRelID = relID
		}

		authorProfileID := entry.AuthorProfileID.Hex()
		authorProfile := profilesByID[authorProfileID]
		authorUsername := sanitizeString(authorProfile.Username, false)

		comments = append(comments, CommentData{
			ID:              commentID,
			RelID:           commentRelID,
			AuthorProfileID: authorProfileID,
			Username:        authorUsername,
			CommentContent:  sanitizeString(entry.CommentContent, true),
			Time:            entry.Time,
		})
	}

	writeJSON(w, CommentListResponse{
		RelID:    relID,
		Comments: comments,
	})
}

func createCommentHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}

	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	username := sanitizeString(currentProfile.Username, false)
	if username == "" {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req CommentCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relID := sanitizeString(req.RelID, false)
	commentContent := sanitizeString(req.CommentContent, true)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}
	if commentContent == "" {
		http.Error(w, `{"error":"comment_content is required"}`, http.StatusBadRequest)
		return
	}

	entry := CommentEntry{
		RelID:           relID,
		AuthorProfileID: currentProfile.Id,
		CommentContent:  commentContent,
		Time:            time.Now().Unix(),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := client.Database(DBName).Collection("comments").InsertOne(ctx, entry)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if err := adjustPostActionCount(ctx, relID, "comment_count", 1); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	if objectID, ok := result.InsertedID.(primitive.ObjectID); ok {
		entry.ID = objectID
	}

	commentID := ""
	if !entry.ID.IsZero() {
		commentID = entry.ID.Hex()
	}

	writeJSON(w, CommentCreateResponse{
		RelID: relID,
		Comment: CommentData{
			ID:              commentID,
			RelID:           relID,
			AuthorProfileID: currentProfile.Id.Hex(),
			Username:        username,
			CommentContent:  commentContent,
			Time:            entry.Time,
		},
	})
}

func likeStateBatchHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req InteractionStateBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relIDs := sanitizeInteractionRelIDs(req.RelIDs)
	if len(relIDs) > interactionBatchLimit {
		http.Error(w, `{"error":"Too many rel_ids"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stateMap, err := findInteractionStates(ctx, "likes", relIDs, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, LikeStateBatchResponse{
		IsLiked: stateMap,
	})
}

func followStateBatchHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req InteractionStateBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relIDs := sanitizeInteractionRelIDs(req.RelIDs)
	if len(relIDs) > interactionBatchLimit {
		http.Error(w, `{"error":"Too many rel_ids"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stateMap, err := findInteractionStates(ctx, "follows", relIDs, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, FollowStateBatchResponse{
		IsFollowed: stateMap,
	})
}

func shareStateBatchHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req InteractionStateBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relIDs := sanitizeInteractionRelIDs(req.RelIDs)
	if len(relIDs) > interactionBatchLimit {
		http.Error(w, `{"error":"Too many rel_ids"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stateMap, err := findInteractionStates(ctx, "shares", relIDs, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, ShareStateBatchResponse{
		IsShared: stateMap,
	})
}

func repostStateBatchHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req InteractionStateBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relIDs := sanitizeInteractionRelIDs(req.RelIDs)
	if len(relIDs) > interactionBatchLimit {
		http.Error(w, `{"error":"Too many rel_ids"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stateMap, err := findInteractionStates(ctx, "reposts", relIDs, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, RepostStateBatchResponse{
		IsReposted: stateMap,
	})
}

func saveStateBatchHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req InteractionStateBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relIDs := sanitizeInteractionRelIDs(req.RelIDs)
	if len(relIDs) > interactionBatchLimit {
		http.Error(w, `{"error":"Too many rel_ids"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stateMap, err := findInteractionStates(ctx, "saves", relIDs, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, SaveStateBatchResponse{
		IsSaved: stateMap,
	})
}

func likeAddHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	likeAdded, err := addInteractionIfNew(ctx, "likes", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if likeAdded {
		if err := adjustPostActionCount(ctx, relID, "like_count", 1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, LikeStateResponse{
		RelID:   relID,
		IsLiked: true,
	})
}

func likeRemoveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	likeRemoved, err := removeInteractionIfExists(ctx, "likes", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if likeRemoved {
		if err := adjustPostActionCount(ctx, relID, "like_count", -1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, LikeStateResponse{
		RelID:   relID,
		IsLiked: false,
	})
}

func shareAddHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	shareAdded, err := addInteractionIfNew(ctx, "shares", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if shareAdded {
		if err := adjustPostActionCount(ctx, relID, "share_count", 1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, ShareStateResponse{
		RelID:    relID,
		IsShared: true,
	})
}

func shareRemoveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	shareRemoved, err := removeInteractionIfExists(ctx, "shares", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if shareRemoved {
		if err := adjustPostActionCount(ctx, relID, "share_count", -1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, ShareStateResponse{
		RelID:    relID,
		IsShared: false,
	})
}

func repostAddHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	repostAdded, err := addInteractionIfNew(ctx, "reposts", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if repostAdded {
		if err := adjustPostActionCount(ctx, relID, "repost_count", 1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, RepostStateResponse{
		RelID:      relID,
		IsReposted: true,
	})
}

func repostRemoveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	repostRemoved, err := removeInteractionIfExists(ctx, "reposts", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if repostRemoved {
		if err := adjustPostActionCount(ctx, relID, "repost_count", -1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, RepostStateResponse{
		RelID:      relID,
		IsReposted: false,
	})
}

func saveAddHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	saveAdded, err := addInteractionIfNew(ctx, "saves", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if saveAdded {
		if err := adjustPostActionCount(ctx, relID, "save_count", 1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, SaveStateResponse{
		RelID:   relID,
		IsSaved: true,
	})
}

func saveRemoveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	saveRemoved, err := removeInteractionIfExists(ctx, "saves", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if saveRemoved {
		if err := adjustPostActionCount(ctx, relID, "save_count", -1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, SaveStateResponse{
		RelID:   relID,
		IsSaved: false,
	})
}

func followAddHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	followAdded, err := addInteractionIfNew(ctx, "follows", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if followAdded {
		if err := adjustProfileFollowerCount(ctx, relID, 1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, FollowStateResponse{
		RelID:      relID,
		IsFollowed: true,
	})
}

func followRemoveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	followRemoved, err := removeInteractionIfExists(ctx, "follows", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if followRemoved {
		if err := adjustProfileFollowerCount(ctx, relID, -1); err != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, FollowStateResponse{
		RelID:      relID,
		IsFollowed: false,
	})
}

func blockHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getBlockStateHandler(w, r)
		return
	case http.MethodPost:
		toggleBlockHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func getBlockStateHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID := sanitizeString(r.URL.Query().Get("rel_id"), false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isBlocked, err := findInteractionState(ctx, "blocks", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, BlockStateResponse{
		RelID:     relID,
		IsBlocked: isBlocked,
	})
}

func toggleBlockHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}

	relObjectID, err := primitive.ObjectIDFromHex(relID)
	if err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}
	if relObjectID == currentProfile.Id {
		http.Error(w, `{"error":"Unable to block your own account"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isBlocked, err := toggleInteractionState(ctx, "blocks", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, BlockStateResponse{
		RelID:     relID,
		IsBlocked: isBlocked,
	})
}

func blockAddHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}

	relObjectID, err := primitive.ObjectIDFromHex(relID)
	if err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}
	if relObjectID == currentProfile.Id {
		http.Error(w, `{"error":"Unable to block your own account"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if _, err := addInteractionIfNew(ctx, "blocks", relID, currentProfile.Id); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, BlockStateResponse{
		RelID:     relID,
		IsBlocked: true,
	})
}

func blockRemoveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID, ok := readInteractionRelIDRequest(w, r)
	if !ok {
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if _, err := removeInteractionIfExists(ctx, "blocks", relID, currentProfile.Id); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, BlockStateResponse{
		RelID:     relID,
		IsBlocked: false,
	})
}

func blockListHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	blocksCollection := client.Database(DBName).Collection("blocks")
	cursor, err := blocksCollection.Find(
		ctx,
		bson.M{"profile_id": currentProfile.Id},
		options.Find().
			SetProjection(bson.M{
				"rel_id": 1,
				"time":   1,
			}).
			SetSort(bson.D{{Key: "time", Value: -1}}).
			SetLimit(500),
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	type blockListEntry struct {
		RelID string `bson:"rel_id"`
		Time  int64  `bson:"time"`
	}

	blockEntries := make([]blockListEntry, 0)
	targetProfileIDs := make([]primitive.ObjectID, 0)
	seenProfileIDs := make(map[primitive.ObjectID]struct{})
	for cursor.Next(ctx) {
		var entry blockListEntry
		if err := cursor.Decode(&entry); err != nil {
			continue
		}

		relID := sanitizeString(entry.RelID, false)
		if relID == "" {
			continue
		}

		targetProfileID, err := primitive.ObjectIDFromHex(relID)
		if err != nil || targetProfileID.IsZero() {
			continue
		}

		blockEntries = append(blockEntries, blockListEntry{
			RelID: relID,
			Time:  entry.Time,
		})
		if _, exists := seenProfileIDs[targetProfileID]; exists {
			continue
		}
		seenProfileIDs[targetProfileID] = struct{}{}
		targetProfileIDs = append(targetProfileIDs, targetProfileID)
	}
	if err := cursor.Err(); err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	profilesByID, err := getProfileLookupByIDs(ctx, targetProfileIDs)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	blockedProfiles := make([]BlockedProfileSummary, 0, len(blockEntries))
	for _, blockEntry := range blockEntries {
		targetProfileID, err := primitive.ObjectIDFromHex(blockEntry.RelID)
		if err != nil || targetProfileID.IsZero() {
			continue
		}

		profile := profilesByID[targetProfileID.Hex()]
		blockedProfiles = append(blockedProfiles, BlockedProfileSummary{
			RelID:             blockEntry.RelID,
			Username:          sanitizeString(profile.Username, false),
			FirstName:         sanitizeString(profile.FirstName, true),
			LastName:          sanitizeString(profile.LastName, true),
			ProfilePictureURL: sanitizeString(profile.ProfilePictureURL, true),
			Time:              blockEntry.Time,
		})
	}

	writeJSON(w, BlockedProfilesResponse{
		BlockedProfiles: blockedProfiles,
	})
}

func reportHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req ReportCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relID := sanitizeString(req.RelID, false)
	entityType := sanitizeString(strings.ToLower(req.EntityType), false)
	reason := clampRunes(sanitizeString(req.Reason, true), moderationReasonMaxChars)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}
	if entityType != "post" && entityType != "profile" {
		http.Error(w, `{"error":"entity_type must be post or profile"}`, http.StatusBadRequest)
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	reportsCollection := client.Database(DBName).Collection("reports")
	_, err := reportsCollection.UpdateOne(
		ctx,
		bson.M{
			"rel_id":      relID,
			"profile_id":  currentProfile.Id,
			"entity_type": entityType,
		},
		bson.M{
			"$set": bson.M{
				"reason": reason,
				"time":   time.Now().Unix(),
			},
			"$setOnInsert": bson.M{
				"rel_id":      relID,
				"profile_id":  currentProfile.Id,
				"entity_type": entityType,
			},
		},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, ReportResponse{
		RelID:      relID,
		EntityType: entityType,
		Message:    "Report submitted",
	})
}

func getLikeStateHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID := sanitizeString(r.URL.Query().Get("rel_id"), false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isLiked, err := findInteractionState(ctx, "likes", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, LikeStateResponse{
		RelID:   relID,
		IsLiked: isLiked,
	})
}

func toggleLikeHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req InteractionToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relID := sanitizeString(req.RelID, false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isLiked, err := findInteractionState(ctx, "likes", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if isLiked {
		likeRemoved, removeErr := removeInteractionIfExists(ctx, "likes", relID, currentProfile.Id)
		if removeErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if likeRemoved {
			if countErr := adjustPostActionCount(ctx, relID, "like_count", -1); countErr != nil {
				http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
				return
			}
		}
		isLiked = false
	} else {
		likeAdded, addErr := addInteractionIfNew(ctx, "likes", relID, currentProfile.Id)
		if addErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if likeAdded {
			if countErr := adjustPostActionCount(ctx, relID, "like_count", 1); countErr != nil {
				http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
				return
			}
		}
		isLiked = true
	}

	writeJSON(w, LikeStateResponse{
		RelID:   relID,
		IsLiked: isLiked,
	})
}

func getShareStateHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID := sanitizeString(r.URL.Query().Get("rel_id"), false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isShared, err := findInteractionState(ctx, "shares", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, ShareStateResponse{
		RelID:    relID,
		IsShared: isShared,
	})
}

func toggleShareHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req InteractionToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relID := sanitizeString(req.RelID, false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isShared, err := findInteractionState(ctx, "shares", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if isShared {
		shareRemoved, removeErr := removeInteractionIfExists(ctx, "shares", relID, currentProfile.Id)
		if removeErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if shareRemoved {
			if countErr := adjustPostActionCount(ctx, relID, "share_count", -1); countErr != nil {
				http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
				return
			}
		}
		isShared = false
	} else {
		shareAdded, addErr := addInteractionIfNew(ctx, "shares", relID, currentProfile.Id)
		if addErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if shareAdded {
			if countErr := adjustPostActionCount(ctx, relID, "share_count", 1); countErr != nil {
				http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
				return
			}
		}
		isShared = true
	}

	writeJSON(w, ShareStateResponse{
		RelID:    relID,
		IsShared: isShared,
	})
}

func getRepostStateHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID := sanitizeString(r.URL.Query().Get("rel_id"), false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isReposted, err := findInteractionState(ctx, "reposts", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, RepostStateResponse{
		RelID:      relID,
		IsReposted: isReposted,
	})
}

func toggleRepostHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req InteractionToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relID := sanitizeString(req.RelID, false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isReposted, err := findInteractionState(ctx, "reposts", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if isReposted {
		repostRemoved, removeErr := removeInteractionIfExists(ctx, "reposts", relID, currentProfile.Id)
		if removeErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if repostRemoved {
			if countErr := adjustPostActionCount(ctx, relID, "repost_count", -1); countErr != nil {
				http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
				return
			}
		}
		isReposted = false
	} else {
		repostAdded, addErr := addInteractionIfNew(ctx, "reposts", relID, currentProfile.Id)
		if addErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if repostAdded {
			if countErr := adjustPostActionCount(ctx, relID, "repost_count", 1); countErr != nil {
				http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
				return
			}
		}
		isReposted = true
	}

	writeJSON(w, RepostStateResponse{
		RelID:      relID,
		IsReposted: isReposted,
	})
}

func getSaveStateHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID := sanitizeString(r.URL.Query().Get("rel_id"), false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isSaved, err := findInteractionState(ctx, "saves", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, SaveStateResponse{
		RelID:   relID,
		IsSaved: isSaved,
	})
}

func toggleSaveHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req InteractionToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relID := sanitizeString(req.RelID, false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isSaved, err := findInteractionState(ctx, "saves", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if isSaved {
		saveRemoved, removeErr := removeInteractionIfExists(ctx, "saves", relID, currentProfile.Id)
		if removeErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if saveRemoved {
			if countErr := adjustPostActionCount(ctx, relID, "save_count", -1); countErr != nil {
				http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
				return
			}
		}
		isSaved = false
	} else {
		saveAdded, addErr := addInteractionIfNew(ctx, "saves", relID, currentProfile.Id)
		if addErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if saveAdded {
			if countErr := adjustPostActionCount(ctx, relID, "save_count", 1); countErr != nil {
				http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
				return
			}
		}
		isSaved = true
	}

	writeJSON(w, SaveStateResponse{
		RelID:   relID,
		IsSaved: isSaved,
	})
}

func getFollowStateHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	relID := sanitizeString(r.URL.Query().Get("rel_id"), false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isFollowed, err := findInteractionState(ctx, "follows", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, FollowStateResponse{
		RelID:      relID,
		IsFollowed: isFollowed,
	})
}

func toggleFollowHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req InteractionToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	relID := sanitizeString(req.RelID, false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return
	}
	if _, err := primitive.ObjectIDFromHex(relID); err != nil {
		http.Error(w, `{"error":"Invalid rel_id format"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	isFollowed, err := findInteractionState(ctx, "follows", relID, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	if isFollowed {
		followRemoved, removeErr := removeInteractionIfExists(ctx, "follows", relID, currentProfile.Id)
		if removeErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if followRemoved {
			if countErr := adjustProfileFollowerCount(ctx, relID, -1); countErr != nil {
				http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
				return
			}
		}
		isFollowed = false
	} else {
		followAdded, addErr := addInteractionIfNew(ctx, "follows", relID, currentProfile.Id)
		if addErr != nil {
			http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
			return
		}
		if followAdded {
			if countErr := adjustProfileFollowerCount(ctx, relID, 1); countErr != nil {
				http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
				return
			}
		}
		isFollowed = true
	}

	writeJSON(w, FollowStateResponse{
		RelID:      relID,
		IsFollowed: isFollowed,
	})
}

func adjustProfileFollowerCount(ctx context.Context, profileRelID string, delta int) error {
	if delta == 0 {
		return nil
	}

	profileID, err := primitive.ObjectIDFromHex(profileRelID)
	if err != nil {
		return err
	}

	_, err = client.Database(DBName).Collection("profiles").UpdateOne(
		ctx,
		bson.M{"_id": profileID},
		bson.M{"$inc": bson.M{"followers": delta}},
	)
	if err != nil {
		return err
	}

	if delta < 0 {
		_, err = client.Database(DBName).Collection("profiles").UpdateOne(
			ctx,
			bson.M{
				"_id":       profileID,
				"followers": bson.M{"$lt": 0},
			},
			bson.M{"$set": bson.M{"followers": 0}},
		)
		if err != nil {
			return err
		}
	}

	return nil
}

func adjustPostActionCount(ctx context.Context, postRelID string, fieldName string, delta int) error {
	if delta == 0 {
		return nil
	}

	postID, err := primitive.ObjectIDFromHex(postRelID)
	if err != nil {
		return err
	}

	switch fieldName {
	case "like_count", "comment_count", "repost_count", "view_count", "share_count", "save_count":
	default:
		return errors.New("invalid post count field")
	}

	updateResult, err := client.Database(DBName).Collection("posts").UpdateOne(
		ctx,
		bson.M{"_id": postID},
		bson.M{"$inc": bson.M{fieldName: delta}},
	)
	if err != nil {
		return err
	}
	if updateResult.MatchedCount == 0 {
		return mongo.ErrNoDocuments
	}

	if delta < 0 {
		_, err = client.Database(DBName).Collection("posts").UpdateOne(
			ctx,
			bson.M{
				"_id":     postID,
				fieldName: bson.M{"$lt": 0},
			},
			bson.M{"$set": bson.M{fieldName: 0}},
		)
		if err != nil {
			return err
		}
	}

	return nil
}

func addInteractionIfNew(ctx context.Context, collectionName string, relID string, profileID primitive.ObjectID) (bool, error) {
	if profileID.IsZero() {
		return false, mongo.ErrNoDocuments
	}

	collection := client.Database(DBName).Collection(collectionName)
	now := time.Now().Unix()

	result, err := collection.UpdateOne(
		ctx,
		bson.M{
			"rel_id":     relID,
			"profile_id": profileID,
		},
		bson.M{
			"$set": bson.M{
				"time": now,
			},
			"$setOnInsert": bson.M{
				"rel_id":     relID,
				"profile_id": profileID,
			},
		},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		return false, err
	}

	return result.UpsertedCount > 0, nil
}

func removeInteractionIfExists(ctx context.Context, collectionName string, relID string, profileID primitive.ObjectID) (bool, error) {
	if profileID.IsZero() {
		return false, nil
	}

	collection := client.Database(DBName).Collection(collectionName)
	result, err := collection.DeleteMany(ctx, bson.M{
		"rel_id":     relID,
		"profile_id": profileID,
	})
	if err != nil {
		return false, err
	}

	return result.DeletedCount > 0, nil
}

func findInteractionState(ctx context.Context, collectionName string, relID string, profileID primitive.ObjectID) (bool, error) {
	if profileID.IsZero() {
		return false, nil
	}

	collection := client.Database(DBName).Collection(collectionName)
	err := collection.FindOne(ctx, bson.M{
		"rel_id":     relID,
		"profile_id": profileID,
	}).Err()
	if err == mongo.ErrNoDocuments {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func toggleInteractionState(ctx context.Context, collectionName string, relID string, profileID primitive.ObjectID) (bool, error) {
	existing, err := findInteractionState(ctx, collectionName, relID, profileID)
	if err != nil {
		return false, err
	}

	if existing {
		if err := removeInteraction(ctx, collectionName, relID, profileID); err != nil {
			return false, err
		}
		return false, nil
	}

	if err := addInteraction(ctx, collectionName, relID, profileID); err != nil {
		return false, err
	}
	return true, nil
}

func addInteraction(ctx context.Context, collectionName string, relID string, profileID primitive.ObjectID) error {
	if profileID.IsZero() {
		return mongo.ErrNoDocuments
	}

	collection := client.Database(DBName).Collection(collectionName)
	now := time.Now().Unix()

	_, err := collection.UpdateOne(
		ctx,
		bson.M{
			"rel_id":     relID,
			"profile_id": profileID,
		},
		bson.M{
			"$set": bson.M{
				"time": now,
			},
			"$setOnInsert": bson.M{
				"rel_id":     relID,
				"profile_id": profileID,
			},
		},
		options.Update().SetUpsert(true),
	)
	return err
}

func removeInteraction(ctx context.Context, collectionName string, relID string, profileID primitive.ObjectID) error {
	if profileID.IsZero() {
		return nil
	}

	collection := client.Database(DBName).Collection(collectionName)
	_, err := collection.DeleteMany(ctx, bson.M{
		"rel_id":     relID,
		"profile_id": profileID,
	})
	return err
}

func findInteractionStates(ctx context.Context, collectionName string, relIDs []string, profileID primitive.ObjectID) (map[string]bool, error) {
	stateMap := make(map[string]bool, len(relIDs))
	if len(relIDs) == 0 {
		return stateMap, nil
	}
	if profileID.IsZero() {
		return stateMap, nil
	}

	for _, relID := range relIDs {
		stateMap[relID] = false
	}

	collection := client.Database(DBName).Collection(collectionName)
	cursor, err := collection.Find(ctx, bson.M{
		"profile_id": profileID,
		"rel_id":     bson.M{"$in": relIDs},
	}, options.Find().SetProjection(bson.M{"rel_id": 1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	type interactionRelIDEntry struct {
		RelID string `bson:"rel_id"`
	}

	for cursor.Next(ctx) {
		var entry interactionRelIDEntry
		if err := cursor.Decode(&entry); err != nil {
			continue
		}
		relID := sanitizeString(entry.RelID, false)
		if relID == "" {
			continue
		}
		if _, ok := stateMap[relID]; ok {
			stateMap[relID] = true
		}
	}

	return stateMap, nil
}

func readInteractionRelIDRequest(w http.ResponseWriter, r *http.Request) (string, bool) {
	defer r.Body.Close()
	var req InteractionToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return "", false
	}

	relID := sanitizeString(req.RelID, false)
	if relID == "" {
		http.Error(w, `{"error":"rel_id is required"}`, http.StatusBadRequest)
		return "", false
	}

	return relID, true
}

func sanitizeInteractionRelIDs(rawRelIDs []string) []string {
	if len(rawRelIDs) == 0 {
		return []string{}
	}

	seen := make(map[string]struct{}, len(rawRelIDs))
	sanitized := make([]string, 0, len(rawRelIDs))
	for _, rawRelID := range rawRelIDs {
		relID := sanitizeString(rawRelID, false)
		if relID == "" {
			continue
		}
		if _, exists := seen[relID]; exists {
			continue
		}

		seen[relID] = struct{}{}
		sanitized = append(sanitized, relID)
	}

	return sanitized
}

// SearchProfilesHandler searches profiles by username, first name, and last name
// with typo-tolerant scoring. Supports pagination via limit and offset parameters.
func SearchProfilesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := normalizeSearchTerm(r.URL.Query().Get("query"))

	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	limit := searchProfilesLimitDefault
	limitStr := sanitizeString(r.URL.Query().Get("limit"), false)
	if limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	if limit > searchProfilesLimitMax {
		limit = searchProfilesLimitMax
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	blockedProfileIDs, err := getBlockedProfileIDsForProfile(ctx, currentProfile.Id)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	results, err := searchProfiles(ctx, query, limit, currentProfile.Id, blockedProfileIDs)
	if err != nil {
		if errors.Is(err, errSearchQueryTooShort) {
			http.Error(w, fmt.Sprintf(`{"error":"query must be at least %d characters"}`, getSearchProfilesQueryMinChars()), http.StatusBadRequest)
			return
		}
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, SearchProfilesResponse{
		Query:   query,
		Results: results,
	})
}

func searchProfiles(ctx context.Context, rawQuery string, limit int, excludeProfileID primitive.ObjectID, blockedProfileIDs []primitive.ObjectID) ([]SearchProfileResult, error) {
	query := normalizeSearchTerm(rawQuery)
	if countSearchQueryCharacters(query) < getSearchProfilesQueryMinChars() {
		return nil, errSearchQueryTooShort
	}
	tokens := strings.Fields(query)
	blockedProfileIDSet := make(map[primitive.ObjectID]struct{}, len(blockedProfileIDs))
	for _, blockedProfileID := range blockedProfileIDs {
		if blockedProfileID.IsZero() {
			continue
		}
		blockedProfileIDSet[blockedProfileID] = struct{}{}
	}

	collection := client.Database(DBName).Collection("profiles")
	projection := bson.M{
		"_id":                 1,
		"username":            1,
		"first_name":          1,
		"last_name":           1,
		"profile_picture_url": 1,
		"created_time":        1,
	}

	candidateMap := make(map[string]SearchProfileEntry)

	loadCandidates := func(filter bson.M, fetchLimit int64) error {
		findOptions := options.Find().
			SetProjection(projection).
			SetLimit(fetchLimit)

		cursor, err := collection.Find(ctx, filter, findOptions)
		if err != nil {
			return err
		}
		defer cursor.Close(ctx)

		for cursor.Next(ctx) {
			var entry SearchProfileEntry
			if decodeErr := cursor.Decode(&entry); decodeErr != nil {
				continue
			}
			if entry.Id.IsZero() {
				continue
			}
			if excludeProfileID == entry.Id {
				continue
			}
			if _, isBlocked := blockedProfileIDSet[entry.Id]; isBlocked {
				continue
			}

			username := sanitizeString(entry.Username, true)
			if username == "" {
				continue
			}

			entry.Username = username
			entry.FirstName = sanitizeString(entry.FirstName, true)
			entry.LastName = sanitizeString(entry.LastName, true)
			entry.ProfilePictureURL = sanitizeString(entry.ProfilePictureURL, true)

			usernameKey := strings.ToLower(username)
			existing, exists := candidateMap[usernameKey]
			if !exists || entry.CreatedTime > existing.CreatedTime {
				candidateMap[usernameKey] = entry
			}
		}

		return nil
	}

	strongLimit := int64(limit * 8)
	if strongLimit < 250 {
		strongLimit = 250
	}
	if strongLimit > 1500 {
		strongLimit = 1500
	}
	if err := loadCandidates(buildStrongProfileSearchFilter(query, tokens), strongLimit); err != nil {
		return nil, err
	}

	if len(candidateMap) < limit {
		fuzzyLimit := int64(limit * 14)
		if fuzzyLimit < 400 {
			fuzzyLimit = 400
		}
		if fuzzyLimit > 1200 {
			fuzzyLimit = 1200
		}
		if err := loadCandidates(buildFuzzyProfileCandidateFilter(tokens), fuzzyLimit); err != nil {
			return nil, err
		}

		if len(candidateMap) < limit {
			fallbackLimit := int64(limit * 16)
			if fallbackLimit < 450 {
				fallbackLimit = 450
			}
			if fallbackLimit > 1400 {
				fallbackLimit = 1400
			}
			if err := loadCandidates(bson.M{}, fallbackLimit); err != nil {
				return nil, err
			}
		}
	}

	type scoredSearchProfile struct {
		result      SearchProfileResult
		score       int
		createdTime int
	}
	scoredResults := make([]scoredSearchProfile, 0, len(candidateMap))

	for _, candidate := range candidateMap {
		isMatch, score := scoreSearchProfileCandidate(candidate, query, tokens)
		if !isMatch {
			continue
		}

		scoredResults = append(scoredResults, scoredSearchProfile{
			result: SearchProfileResult{
				Username:          candidate.Username,
				FirstName:         candidate.FirstName,
				LastName:          candidate.LastName,
				ProfilePictureURL: candidate.ProfilePictureURL,
			},
			score:       score,
			createdTime: candidate.CreatedTime,
		})
	}

	sort.Slice(scoredResults, func(left int, right int) bool {
		if scoredResults[left].score != scoredResults[right].score {
			return scoredResults[left].score < scoredResults[right].score
		}
		if scoredResults[left].createdTime != scoredResults[right].createdTime {
			return scoredResults[left].createdTime > scoredResults[right].createdTime
		}
		return strings.ToLower(scoredResults[left].result.Username) < strings.ToLower(scoredResults[right].result.Username)
	})

	if len(scoredResults) > limit {
		scoredResults = scoredResults[:limit]
	}

	results := make([]SearchProfileResult, 0, len(scoredResults))
	for _, entry := range scoredResults {
		results = append(results, entry.result)
	}

	return results, nil
}

func getSearchProfilesQueryMinChars() int {
	if SearchAutocompleteMinChars > 0 {
		return SearchAutocompleteMinChars
	}
	return 1
}

func buildStrongProfileSearchFilter(query string, tokens []string) bson.M {
	escapedQuery := regexp.QuoteMeta(query)
	matchers := bson.A{
		bson.M{"username": primitive.Regex{Pattern: escapedQuery, Options: "i"}},
		bson.M{"first_name": primitive.Regex{Pattern: escapedQuery, Options: "i"}},
		bson.M{"last_name": primitive.Regex{Pattern: escapedQuery, Options: "i"}},
		bson.M{
			"$expr": bson.M{
				"$regexMatch": bson.M{
					"input": bson.M{
						"$trim": bson.M{
							"input": bson.M{
								"$concat": bson.A{"$first_name", " ", "$last_name"},
							},
						},
					},
					"regex":   escapedQuery,
					"options": "i",
				},
			},
		},
	}

	if len(tokens) >= 2 {
		leftToken := regexp.QuoteMeta(tokens[0])
		rightToken := regexp.QuoteMeta(strings.Join(tokens[1:], " "))
		matchers = append(matchers,
			bson.M{
				"$and": bson.A{
					bson.M{"first_name": primitive.Regex{Pattern: leftToken, Options: "i"}},
					bson.M{"last_name": primitive.Regex{Pattern: rightToken, Options: "i"}},
				},
			},
			bson.M{
				"$and": bson.A{
					bson.M{"first_name": primitive.Regex{Pattern: rightToken, Options: "i"}},
					bson.M{"last_name": primitive.Regex{Pattern: leftToken, Options: "i"}},
				},
			},
		)
	}

	for _, token := range tokens {
		escapedToken := regexp.QuoteMeta(token)
		if escapedToken == "" {
			continue
		}
		matchers = append(matchers,
			bson.M{"username": primitive.Regex{Pattern: escapedToken, Options: "i"}},
			bson.M{"first_name": primitive.Regex{Pattern: escapedToken, Options: "i"}},
			bson.M{"last_name": primitive.Regex{Pattern: escapedToken, Options: "i"}},
		)
	}

	return bson.M{"$or": matchers}
}

func buildFuzzyProfileCandidateFilter(tokens []string) bson.M {
	if len(tokens) == 0 {
		return bson.M{}
	}

	matchers := bson.A{}
	for _, token := range tokens {
		if token == "" {
			continue
		}

		tokenRunes := []rune(token)
		if len(tokenRunes) == 0 {
			continue
		}

		prefixPattern := "^" + regexp.QuoteMeta(string(tokenRunes[0]))
		prefixRegex := primitive.Regex{Pattern: prefixPattern, Options: "i"}
		matchers = append(matchers,
			bson.M{"username": prefixRegex},
			bson.M{"first_name": prefixRegex},
			bson.M{"last_name": prefixRegex},
		)
	}

	if len(matchers) == 0 {
		return bson.M{}
	}
	return bson.M{"$or": matchers}
}

func scoreSearchProfileCandidate(profile SearchProfileEntry, query string, tokens []string) (bool, int) {
	username := normalizeSearchTerm(profile.Username)
	firstName := normalizeSearchTerm(profile.FirstName)
	lastName := normalizeSearchTerm(profile.LastName)
	fullName := strings.TrimSpace(firstName + " " + lastName)
	reverseFullName := strings.TrimSpace(lastName + " " + firstName)

	fields := []string{
		username,
		firstName,
		lastName,
		fullName,
		reverseFullName,
	}

	bestScore := int(^uint(0) >> 1)

	for _, field := range fields {
		score, isMatch := scoreFieldMatch(query, field)
		if isMatch && score < bestScore {
			bestScore = score
		}
	}

	if len(tokens) >= 2 {
		leftToken := tokens[0]
		rightToken := strings.Join(tokens[1:], " ")
		if tokenMatches(leftToken, firstName) && tokenMatches(rightToken, lastName) {
			if 8 < bestScore {
				bestScore = 8
			}
		}
		if tokenMatches(leftToken, lastName) && tokenMatches(rightToken, firstName) {
			if 9 < bestScore {
				bestScore = 9
			}
		}
	}

	for _, token := range tokens {
		if token == "" {
			continue
		}
		if tokenMatches(token, username) || tokenMatches(token, firstName) || tokenMatches(token, lastName) {
			tokenScore := 20 + absRuneLengthDiff(token, query)
			if tokenScore < bestScore {
				bestScore = tokenScore
			}
		}
	}

	if bestScore == int(^uint(0)>>1) {
		return false, 0
	}
	return true, bestScore
}

func scoreFieldMatch(query string, field string) (int, bool) {
	if query == "" || field == "" {
		return 0, false
	}

	if field == query {
		return 0, true
	}

	if strings.HasPrefix(field, query) {
		return 6 + absRuneLengthDiff(field, query), true
	}

	if strings.Contains(field, query) {
		return 14 + absRuneLengthDiff(field, query), true
	}

	distance := levenshteinDistance(query, field)
	maxLength := maxRuneLength(query, field)
	if maxLength == 0 {
		return 0, false
	}

	ratio := float64(distance) / float64(maxLength)
	if distance <= 1 || (maxLength <= 8 && distance <= 2) || ratio <= 0.30 {
		return 30 + (distance * 6) + absRuneLengthDiff(field, query), true
	}

	return 0, false
}

func tokenMatches(token string, target string) bool {
	if token == "" || target == "" {
		return false
	}

	if strings.HasPrefix(target, token) || strings.Contains(target, token) {
		return true
	}

	targetParts := splitSearchParts(target)
	for _, part := range targetParts {
		if part == "" {
			continue
		}
		if strings.HasPrefix(part, token) || strings.Contains(part, token) {
			return true
		}

		distance := levenshteinDistance(token, part)
		maxLength := maxRuneLength(token, part)
		if maxLength == 0 {
			continue
		}
		if distance <= 1 || (maxLength <= 8 && distance <= 2) || float64(distance)/float64(maxLength) <= 0.34 {
			return true
		}
	}

	distance := levenshteinDistance(token, target)
	maxLength := maxRuneLength(token, target)
	if maxLength == 0 {
		return false
	}
	return distance <= 1 || (maxLength <= 8 && distance <= 2) || float64(distance)/float64(maxLength) <= 0.34
}

func splitSearchParts(value string) []string {
	return strings.FieldsFunc(value, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
}

func normalizeSearchTerm(value string) string {
	sanitized := sanitizeString(value, true)
	lowercased := strings.ToLower(sanitized)
	return strings.Join(strings.Fields(lowercased), " ")
}

func countSearchQueryCharacters(value string) int {
	count := 0
	for _, r := range value {
		if unicode.IsSpace(r) {
			continue
		}
		count += 1
	}
	return count
}

func maxRuneLength(left string, right string) int {
	leftLength := len([]rune(left))
	rightLength := len([]rune(right))
	if leftLength > rightLength {
		return leftLength
	}
	return rightLength
}

func absRuneLengthDiff(left string, right string) int {
	diff := len([]rune(left)) - len([]rune(right))
	if diff < 0 {
		return -diff
	}
	return diff
}

func levenshteinDistance(left string, right string) int {
	leftRunes := []rune(left)
	rightRunes := []rune(right)

	if len(leftRunes) == 0 {
		return len(rightRunes)
	}
	if len(rightRunes) == 0 {
		return len(leftRunes)
	}

	if len(leftRunes) < len(rightRunes) {
		leftRunes, rightRunes = rightRunes, leftRunes
	}

	previous := make([]int, len(rightRunes)+1)
	current := make([]int, len(rightRunes)+1)

	for index := 0; index <= len(rightRunes); index += 1 {
		previous[index] = index
	}

	for leftIndex := 1; leftIndex <= len(leftRunes); leftIndex += 1 {
		current[0] = leftIndex
		for rightIndex := 1; rightIndex <= len(rightRunes); rightIndex += 1 {
			cost := 0
			if leftRunes[leftIndex-1] != rightRunes[rightIndex-1] {
				cost = 1
			}

			deletion := previous[rightIndex] + 1
			insertion := current[rightIndex-1] + 1
			substitution := previous[rightIndex-1] + cost

			best := deletion
			if insertion < best {
				best = insertion
			}
			if substitution < best {
				best = substitution
			}
			current[rightIndex] = best
		}

		copy(previous, current)
	}

	return previous[len(rightRunes)]
}

// settingsAccountHandler dispatches account settings requests based on HTTP method.
// GET returns current account data; POST updates account information.
func settingsAccountHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getSettingsAccountHandler(w, r)
		return
	case http.MethodPost:
		updateSettingsAccountHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func getSettingsAccountHandler(w http.ResponseWriter, r *http.Request) {
	session, ok := getCurrentActiveSession(w, r)
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	username, err := resolveCurrentUsernameFromSession(session)
	if err != nil {
		http.Error(w, `{"error":"Unable to resolve account"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	loginsCollection := client.Database(DBName).Collection("logins")
	var loginEntry LoginEntry
	err = loginsCollection.FindOne(ctx, bson.M{
		"username":  username,
		"is_banned": bson.M{"$ne": true},
	}).Decode(&loginEntry)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, `{"error":"Account not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	profilesCollection := client.Database(DBName).Collection("profiles")
	var profileEntry ProfileData
	err = profilesCollection.FindOne(ctx, bson.M{"username": username}).Decode(&profileEntry)
	if err != nil && err != mongo.ErrNoDocuments {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	firstName := sanitizeString(profileEntry.FirstName, true)
	if firstName == "" {
		firstName = sanitizeString(loginEntry.FirstName, true)
	}
	lastName := sanitizeString(profileEntry.LastName, true)
	if lastName == "" {
		lastName = sanitizeString(loginEntry.LastName, true)
	}

	response := SettingsAccountData{
		Username:          username,
		FirstName:         firstName,
		LastName:          lastName,
		Email:             sanitizeString(loginEntry.Email, true),
		PhoneNumber:       sanitizeString(loginEntry.PhoneNumber, false),
		ProfilePictureURL: sanitizeString(profileEntry.ProfilePictureURL, true),
	}
	writeJSON(w, response)
}

func updateSettingsAccountHandler(w http.ResponseWriter, r *http.Request) {
	session, ok := getCurrentActiveSession(w, r)
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	username, err := resolveCurrentUsernameFromSession(session)
	if err != nil {
		http.Error(w, `{"error":"Unable to resolve account"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req SettingsAccountUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	firstName := sanitizeString(req.FirstName, true)
	lastName := sanitizeString(req.LastName, true)
	email := sanitizeString(req.Email, true)
	phoneNumber := sanitizeString(req.PhoneNumber, false)

	if firstName == "" || lastName == "" || email == "" || phoneNumber == "" {
		http.Error(w, `{"error":"All fields are required"}`, http.StatusBadRequest)
		return
	}
	if !strings.Contains(email, "@") {
		http.Error(w, `{"error":"Invalid email address"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	loginsCollection := client.Database(DBName).Collection("logins")
	updateResult, err := loginsCollection.UpdateOne(
		ctx,
		bson.M{
			"username":  username,
			"is_banned": bson.M{"$ne": true},
		},
		bson.M{
			"$set": bson.M{
				"first_name":   firstName,
				"last_name":    lastName,
				"email":        email,
				"phone_number": phoneNumber,
			},
		},
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if updateResult.MatchedCount == 0 {
		http.Error(w, `{"error":"Account not found"}`, http.StatusNotFound)
		return
	}

	profilesCollection := client.Database(DBName).Collection("profiles")
	_, err = profilesCollection.UpdateOne(
		ctx,
		bson.M{"username": username},
		bson.M{
			"$set": bson.M{
				"first_name": firstName,
				"last_name":  lastName,
			},
			"$setOnInsert": bson.M{
				"username":     username,
				"followers":    0,
				"created_time": int(time.Now().Unix()),
			},
		},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	profilePictureURL := ""
	type settingsProfilePictureLookup struct {
		ProfilePictureURL string `bson:"profile_picture_url"`
	}
	var profilePictureEntry settingsProfilePictureLookup
	profilePictureErr := profilesCollection.FindOne(
		ctx,
		bson.M{"username": username},
		options.FindOne().SetProjection(bson.M{
			"profile_picture_url": 1,
		}),
	).Decode(&profilePictureEntry)
	if profilePictureErr == nil {
		profilePictureURL = sanitizeString(profilePictureEntry.ProfilePictureURL, true)
	}

	response := SettingsAccountData{
		Username:          username,
		FirstName:         firstName,
		LastName:          lastName,
		Email:             email,
		PhoneNumber:       phoneNumber,
		ProfilePictureURL: profilePictureURL,
	}

	authExpiry := session.ExpiryTime
	if authExpiry <= 0 {
		authExpiry = time.Now().Unix() + activeSessionDurationSeconds
	}
	refreshUserAuthCookie(w, r, AuthCookiePayload{
		Uid:               sanitizeString(session.Uid, false),
		Username:          username,
		FirstName:         firstName,
		LastName:          lastName,
		Email:             email,
		Phone:             phoneNumber,
		ProfilePictureURL: profilePictureURL,
		ExpiryTime:        authExpiry,
	}, authExpiry)

	writeJSON(w, response)
}

// settingsPasswordHandler updates the current user's password after verifying
// the current password matches the stored credential.
func settingsPasswordHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	session, ok := getCurrentActiveSession(w, r)
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	username, err := resolveCurrentUsernameFromSession(session)
	if err != nil {
		http.Error(w, `{"error":"Unable to resolve account"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req SettingsPasswordUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}

	currentPassword := sanitizeString(req.CurrentPassword, true)
	newPassword := sanitizeString(req.NewPassword, true)
	confirmPassword := sanitizeString(req.ConfirmPassword, true)

	if currentPassword == "" || newPassword == "" || confirmPassword == "" {
		http.Error(w, `{"error":"All password fields are required"}`, http.StatusBadRequest)
		return
	}
	if newPassword != confirmPassword {
		http.Error(w, `{"error":"New passwords do not match"}`, http.StatusBadRequest)
		return
	}
	if newPassword == currentPassword {
		http.Error(w, `{"error":"New password must be different"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	loginsCollection := client.Database(DBName).Collection("logins")
	var loginEntry LoginEntry
	err = loginsCollection.FindOne(
		ctx,
		bson.M{
			"username":  username,
			"is_banned": bson.M{"$ne": true},
		},
	).Decode(&loginEntry)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, `{"error":"Account not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	storedPassword := sanitizeString(loginEntry.Password, true)
	if storedPassword == "" || currentPassword != storedPassword {
		http.Error(w, `{"error":"Current password is incorrect"}`, http.StatusBadRequest)
		return
	}

	updateResult, err := loginsCollection.UpdateOne(
		ctx,
		bson.M{
			"username":  username,
			"password":  storedPassword,
			"is_banned": bson.M{"$ne": true},
		},
		bson.M{
			"$set": bson.M{
				"password": newPassword,
			},
		},
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if updateResult.MatchedCount == 0 {
		http.Error(w, `{"error":"Unable to update password"}`, http.StatusBadRequest)
		return
	}

	writeJSON(w, bson.M{
		"message": "Password updated",
	})
}

// settingsLogoutHandler clears the active session from MongoDB and removes
// the authentication cookies, effectively logging the user out.
func settingsLogoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	session, ok := getCurrentActiveSession(w, r)
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	uid := sanitizeString(session.Uid, false)
	if uid == "" {
		clearUserSessionCookie(w, r)
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := client.Database(DBName).Collection("active_sessions").DeleteMany(
		ctx,
		bson.M{"uid": uid},
	)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	clearUserSessionCookie(w, r)
	writeJSON(w, bson.M{
		"message": "Logged out",
	})
}

// settingsDeleteAccountHandler permanently deletes the current user's account,
// including their profile, posts, sessions, and associated data.
func settingsDeleteAccountHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	session, ok := getCurrentActiveSession(w, r)
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	uid := sanitizeString(session.Uid, false)
	if uid == "" {
		clearUserSessionCookie(w, r)
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	profileID, err := primitive.ObjectIDFromHex(uid)
	if err != nil {
		clearUserSessionCookie(w, r)
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	username, err := resolveCurrentUsernameFromSession(session)
	if err != nil {
		http.Error(w, `{"error":"Unable to resolve account"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	database := client.Database(DBName)

	_, err = database.Collection("likes").DeleteMany(ctx, bson.M{"profile_id": profileID})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("follows").DeleteMany(ctx, bson.M{
		"$or": bson.A{
			bson.M{"profile_id": profileID},
			bson.M{"rel_id": uid},
		},
	})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("blocks").DeleteMany(ctx, bson.M{
		"$or": bson.A{
			bson.M{"profile_id": profileID},
			bson.M{"rel_id": uid},
		},
	})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("reports").DeleteMany(ctx, bson.M{
		"$or": bson.A{
			bson.M{"profile_id": profileID},
			bson.M{"rel_id": uid},
		},
	})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("comments").DeleteMany(ctx, bson.M{"author_profile_id": profileID})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("post_views").DeleteMany(ctx, bson.M{"profile_id": profileID})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("event_rsvps").DeleteMany(ctx, bson.M{"profile_id": profileID})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("stories").DeleteMany(ctx, bson.M{"profile_id": profileID})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("messages").DeleteMany(ctx, bson.M{
		"$or": bson.A{
			bson.M{"sender_profile_id": profileID},
			bson.M{"receiving_profile_id": profileID},
		},
	})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("posts").DeleteMany(ctx, bson.M{"profile_id": profileID})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("logins").DeleteMany(ctx, bson.M{"username": username})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("profiles").DeleteMany(ctx, bson.M{"_id": profileID})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	_, err = database.Collection("active_sessions").DeleteMany(ctx, bson.M{"uid": uid})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	clearUserSessionCookie(w, r)
	writeJSON(w, bson.M{
		"message": "Account deleted",
	})
}

func getProfileLookupByIDs(ctx context.Context, profileIDs []primitive.ObjectID) (map[string]profilePictureLookupEntry, error) {
	profilesByID := make(map[string]profilePictureLookupEntry)
	if len(profileIDs) == 0 {
		return profilesByID, nil
	}

	seen := make(map[primitive.ObjectID]struct{})
	sanitizedProfileIDs := make([]primitive.ObjectID, 0, len(profileIDs))
	for _, profileID := range profileIDs {
		if profileID.IsZero() {
			continue
		}
		if _, exists := seen[profileID]; exists {
			continue
		}
		seen[profileID] = struct{}{}
		sanitizedProfileIDs = append(sanitizedProfileIDs, profileID)
	}
	if len(sanitizedProfileIDs) == 0 {
		return profilesByID, nil
	}

	profilesCollection := client.Database(DBName).Collection("profiles")
	findOptions := options.Find().SetProjection(bson.M{
		"_id":                 1,
		"username":            1,
		"first_name":          1,
		"last_name":           1,
		"profile_picture_url": 1,
	})
	cursor, err := profilesCollection.Find(ctx, bson.M{
		"_id": bson.M{"$in": sanitizedProfileIDs},
	}, findOptions)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	for cursor.Next(ctx) {
		var profile profilePictureLookupEntry
		if err := cursor.Decode(&profile); err != nil {
			continue
		}
		if profile.Id.IsZero() {
			continue
		}

		profile.Username = sanitizeString(profile.Username, false)
		profile.FirstName = sanitizeString(profile.FirstName, true)
		profile.LastName = sanitizeString(profile.LastName, true)
		profile.ProfilePictureURL = sanitizeString(profile.ProfilePictureURL, true)
		profilesByID[profile.Id.Hex()] = profile
	}

	return profilesByID, nil
}

func getProfilePictureURLsByProfileIDs(ctx context.Context, profileIDs []primitive.ObjectID) (map[string]string, error) {
	profilesByID, err := getProfileLookupByIDs(ctx, profileIDs)
	if err != nil {
		return nil, err
	}

	profilePictureURLs := make(map[string]string, len(profilesByID))
	for profileID, profile := range profilesByID {
		profilePictureURL := sanitizeString(profile.ProfilePictureURL, true)
		if profilePictureURL == "" {
			continue
		}
		profilePictureURLs[profileID] = profilePictureURL
	}

	return profilePictureURLs, nil
}

func getProfileUsernamesByProfileIDs(ctx context.Context, profileIDs []primitive.ObjectID) (map[string]string, error) {
	profilesByID, err := getProfileLookupByIDs(ctx, profileIDs)
	if err != nil {
		return nil, err
	}

	usernamesByID := make(map[string]string, len(profilesByID))
	for profileID, profile := range profilesByID {
		username := sanitizeString(profile.Username, false)
		if username == "" {
			continue
		}
		usernamesByID[profileID] = username
	}

	return usernamesByID, nil
}

func resolveCurrentUsernameFromSession(session ActiveSessionEntry) (string, error) {
	username := sanitizeString(session.Username, false)
	if username != "" {
		return username, nil
	}

	uid := sanitizeString(session.Uid, false)
	if uid == "" {
		return "", mongo.ErrNoDocuments
	}

	objectID, err := primitive.ObjectIDFromHex(uid)
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	profilesCollection := client.Database(DBName).Collection("profiles")
	var profileEntry ProfileData
	err = profilesCollection.FindOne(ctx, bson.M{
		"_id": objectID,
	}).Decode(&profileEntry)
	if err != nil {
		return "", err
	}

	username = sanitizeString(profileEntry.Username, false)
	if username == "" {
		return "", mongo.ErrNoDocuments
	}

	_, _ = client.Database(DBName).Collection("active_sessions").UpdateOne(
		ctx,
		bson.M{"uid": uid},
		bson.M{"$set": bson.M{"username": username}},
	)
	return username, nil
}
