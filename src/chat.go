package main

// Package main provides the chat message API handlers for HireKey.
// It supports sending, receiving, listing, and marking messages as read
// with MongoDB-backed persistence.
//
// Endpoints:
//   - GET    /api/v1/chat/message    - List chat messages
//   - POST   /api/v1/chat/message    - Send a chat message
//   - PATCH  /api/v1/chat/message    - Mark messages as read
//   - GET    /api/v1/chat/unread     - Get unread message count

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// chatMessageLimitDefault is the default number of messages returned by the
// chat message list API.
const chatMessageLimitDefault = 50

// chatMessageLimitMax is the maximum number of messages allowed in a single
// chat message list query.
const chatMessageLimitMax = 50

// ChatMessageHandler is the multiplexer for the chat message API endpoint.
// It dispatches to the appropriate handler based on the HTTP method.
func ChatMessageHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		getChatMessagesHandler(w, r)
		return
	case http.MethodPost:
		createChatMessageHandler(w, r)
		return
	case http.MethodPatch:
		markChatMessagesReadHandler(w, r)
		return
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

// ChatUnreadHandler returns the count of unread messages for the current user.
func ChatUnreadHandler(w http.ResponseWriter, r *http.Request) {
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

	unreadCount, err := client.Database(DBName).Collection("messages").CountDocuments(ctx, bson.M{
		"receiving_profile_id": currentProfile.Id,
		"read_time":            bson.M{"$lte": 0},
	})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, ChatUnreadResponse{
		UnreadCount: unreadCount,
	})
}

// getChatMessagesHandler retrieves the recent chat messages for the current user,
// ordered by sent time descending, limited to the configured maximum.
func getChatMessagesHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	currentUsername := sanitizeString(currentProfile.Username, false)

	limit := chatMessageLimitDefault
	rawLimit := sanitizeString(r.URL.Query().Get("limit"), false)
	if rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	if limit > chatMessageLimitMax {
		limit = chatMessageLimitMax
	}

	filter := bson.M{
		"$or": bson.A{
			bson.M{"sender_profile_id": currentProfile.Id},
			bson.M{"receiving_profile_id": currentProfile.Id},
		},
	}

	findOptions := options.Find().
		SetSort(bson.D{
			{Key: "sent_time", Value: -1},
			{Key: "_id", Value: -1},
		}).
		SetLimit(int64(limit))

	collection := client.Database(DBName).Collection("messages")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cursor, err := collection.Find(ctx, filter, findOptions)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	messages := make([]ChatMessageEntry, 0, limit)
	for cursor.Next(ctx) {
		var entry ChatMessageEntry
		if err := cursor.Decode(&entry); err != nil {
			continue
		}
		if entry.SenderProfileID.IsZero() || entry.ReceivingProfileID.IsZero() {
			continue
		}
		messages = append(messages, entry)
	}

	if len(messages) > 1 {
		for left, right := 0, len(messages)-1; left < right; left, right = left+1, right-1 {
			messages[left], messages[right] = messages[right], messages[left]
		}
	}

	profilePictureURLs, profileUsernames, profileDisplayNames, err := getChatProfileLookups(ctx, messages, []primitive.ObjectID{currentProfile.Id})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	payload := ChatMessageListResponse{
		CurrentProfileID:    currentProfile.Id.Hex(),
		CurrentUsername:     currentUsername,
		Messages:            convertChatMessages(messages, profileUsernames),
		ProfilePictureURLs:  profilePictureURLs,
		ProfileUsernames:    profileUsernames,
		ProfileDisplayNames: profileDisplayNames,
	}
	writeJSON(w, payload)
}

// createChatMessageHandler processes a new chat message submission. It validates the
// request body, resolves the receiving user, creates the message document in MongoDB,
// and returns the created message with profile lookups.
func createChatMessageHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	currentUsername := sanitizeString(currentProfile.Username, false)

	defer r.Body.Close()
	var req ChatMessageCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid body"}`, http.StatusBadRequest)
		return
	}

	receivingUsername := sanitizeString(req.ReceivingUsername, false)
	if receivingUsername == "" {
		http.Error(w, `{"error":"receiving_username is required"}`, http.StatusBadRequest)
		return
	}

	messageContent := sanitizeString(req.MessageContent, true)
	attachmentURL := sanitizeString(req.AttachmentURL, true)

	if !req.IsAttachment && messageContent == "" {
		http.Error(w, `{"error":"message_content is required"}`, http.StatusBadRequest)
		return
	}
	if req.IsAttachment && attachmentURL == "" {
		http.Error(w, `{"error":"attachment_url is required"}`, http.StatusBadRequest)
		return
	}
	if messageContent == "" && attachmentURL == "" {
		http.Error(w, `{"error":"Message or attachment is required"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	receivingProfile, err := resolveProfileByUsername(ctx, receivingUsername)
	if err == mongo.ErrNoDocuments {
		http.Error(w, `{"error":"Receiving user not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}
	if receivingProfile.Id.IsZero() {
		http.Error(w, `{"error":"Receiving user not found"}`, http.StatusNotFound)
		return
	}

	if receivingProfile.Id == currentProfile.Id {
		http.Error(w, `{"error":"receiving_username cannot match sender"}`, http.StatusBadRequest)
		return
	}

	sentTime := time.Now().Unix()
	entry := ChatMessageEntry{
		SenderProfileID:    currentProfile.Id,
		ReceivingProfileID: receivingProfile.Id,
		ReadTime:           0,
		SentTime:           sentTime,
		MessageContent:     messageContent,
		IsAttachment:       req.IsAttachment,
		AttachmentURL:      attachmentURL,
	}

	messagesCollection := client.Database(DBName).Collection("messages")
	result, err := messagesCollection.InsertOne(ctx, entry)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	insertedID, ok := result.InsertedID.(primitive.ObjectID)
	if !ok {
		http.Error(w, `{"error":"Invalid ID"}`, http.StatusInternalServerError)
		return
	}
	entry.ID = insertedID

	profilePictureURLs, profileUsernames, profileDisplayNames, err := getChatProfileLookups(ctx, []ChatMessageEntry{entry}, []primitive.ObjectID{currentProfile.Id, receivingProfile.Id})
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	response := ChatMessageCreateResponse{
		CurrentProfileID:    currentProfile.Id.Hex(),
		CurrentUsername:     currentUsername,
		ProfilePictureURLs:  profilePictureURLs,
		ProfileUsernames:    profileUsernames,
		ProfileDisplayNames: profileDisplayNames,
		Message:             convertChatMessages([]ChatMessageEntry{entry}, profileUsernames)[0],
	}
	writeJSON(w, response)
}

// markChatMessagesReadHandler processes a request to mark unread messages from a
// specific peer as read. It updates the read_time field for all matching messages.
func markChatMessagesReadHandler(w http.ResponseWriter, r *http.Request) {
	currentProfile, ok := getCurrentSessionProfile(w, r)
	if !ok {
		return
	}
	if currentProfile.Id.IsZero() {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	defer r.Body.Close()
	var req ChatMessageReadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid body"}`, http.StatusBadRequest)
		return
	}

	peerProfileIDHex := sanitizeString(req.PeerProfileID, false)
	if peerProfileIDHex == "" {
		http.Error(w, `{"error":"peer_profile_id is required"}`, http.StatusBadRequest)
		return
	}

	peerProfileID, err := primitive.ObjectIDFromHex(peerProfileIDHex)
	if err != nil {
		http.Error(w, `{"error":"peer_profile_id is invalid"}`, http.StatusBadRequest)
		return
	}

	if peerProfileID == currentProfile.Id {
		http.Error(w, `{"error":"peer_profile_id cannot match current user"}`, http.StatusBadRequest)
		return
	}

	readTime := time.Now().Unix()
	filter := bson.M{
		"sender_profile_id":    peerProfileID,
		"receiving_profile_id": currentProfile.Id,
		"read_time":            bson.M{"$lte": 0},
	}
	update := bson.M{
		"$set": bson.M{
			"read_time": readTime,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	messagesCollection := client.Database(DBName).Collection("messages")
	result, err := messagesCollection.UpdateMany(ctx, filter, update)
	if err != nil {
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return
	}

	response := ChatMessageReadResponse{
		CurrentProfileID: currentProfile.Id.Hex(),
		PeerProfileID:    peerProfileID.Hex(),
		ReadTime:         readTime,
		UpdatedCount:     result.ModifiedCount,
	}
	writeJSON(w, response)
}

// convertChatMessages converts a slice of ChatMessageEntry database models
// into ChatMessageAPI structs for JSON serialization, populating username fields.
func convertChatMessages(entries []ChatMessageEntry, profileUsernames map[string]string) []ChatMessageAPI {
	messages := make([]ChatMessageAPI, 0, len(entries))
	for _, entry := range entries {
		senderProfileID := ""
		if !entry.SenderProfileID.IsZero() {
			senderProfileID = entry.SenderProfileID.Hex()
		}

		receivingProfileID := ""
		if !entry.ReceivingProfileID.IsZero() {
			receivingProfileID = entry.ReceivingProfileID.Hex()
		}

		messages = append(messages, ChatMessageAPI{
			ID:                 entry.ID.Hex(),
			SenderProfileID:    senderProfileID,
			ReceivingProfileID: receivingProfileID,
			SenderUsername:     sanitizeString(profileUsernames[senderProfileID], false),
			ReceivingUsername:  sanitizeString(profileUsernames[receivingProfileID], false),
			ReadTime:           entry.ReadTime,
			SentTime:           entry.SentTime,
			MessageContent:     entry.MessageContent,
			IsAttachment:       entry.IsAttachment,
			AttachmentURL:      entry.AttachmentURL,
		})
	}
	return messages
}

// getChatProfileLookups resolves profile data (picture URL, username, display name)
// for all profiles referenced in the given messages and extra profile IDs.
func getChatProfileLookups(ctx context.Context, messages []ChatMessageEntry, extraProfileIDs []primitive.ObjectID) (map[string]string, map[string]string, map[string]string, error) {
	profileIDs := make([]primitive.ObjectID, 0, len(messages)*2+len(extraProfileIDs))
	profileIDs = append(profileIDs, extraProfileIDs...)

	for _, message := range messages {
		profileIDs = append(profileIDs, message.SenderProfileID)
		profileIDs = append(profileIDs, message.ReceivingProfileID)
	}

	profilesByID, err := getProfileLookupByIDs(ctx, profileIDs)
	if err != nil {
		return nil, nil, nil, err
	}

	profilePictureURLs := make(map[string]string, len(profilesByID))
	profileUsernames := make(map[string]string, len(profilesByID))
	profileDisplayNames := make(map[string]string, len(profilesByID))

	for profileID, profile := range profilesByID {
		profilePictureURL := sanitizeString(profile.ProfilePictureURL, true)
		if profilePictureURL != "" {
			profilePictureURLs[profileID] = profilePictureURL
		}

		username := sanitizeString(profile.Username, false)
		if username != "" {
			profileUsernames[profileID] = username
		}

		displayName := buildProfileDisplayName(profile.FirstName, profile.LastName, username)
		if displayName != "" {
			profileDisplayNames[profileID] = displayName
		}
	}

	return profilePictureURLs, profileUsernames, profileDisplayNames, nil
}

// buildProfileDisplayName constructs a display name from the user's first name,
// last name, and username, returning the best available option.
func buildProfileDisplayName(firstName string, lastName string, username string) string {
	sanitizedFirstName := sanitizeString(firstName, true)
	sanitizedLastName := sanitizeString(lastName, true)
	displayName := sanitizeString(sanitizedFirstName+" "+sanitizedLastName, true)
	if displayName != "" {
		return displayName
	}

	return sanitizeString(username, false)
}
