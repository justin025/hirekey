package main

// Package main provides mock data seeding functions for development and demo purposes.
// On startup, HireKey seeds sample profiles, posts, and related data into MongoDB
// when the corresponding EnableMock* flags are set to true.

import (
	"context"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// mockProfileSeed defines the template data for a mock profile and its associated posts.
type mockProfileSeed struct {
	username   string
	firstName  string
	lastName   string
	shortBio   string
	longBio    string
	followers  int
	detailRows []ProfileDetail
}

// seedMockData seeds mock profiles and posts into MongoDB. It creates profile documents
// with realistic data and generates posts for each profile with varied media attachments.
func seedMockData(ctx context.Context, seedProfiles bool, seedPosts bool) error {
	if seedProfiles == false && seedPosts == false {
		return nil
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	now := time.Now().Unix()

	profileSeeds := []mockProfileSeed{
		{
			username:  "zuck1",
			firstName: "Mark",
			lastName:  "Zuckerberg",
			shortBio:  "Building social tools and shipping fast.",
			longBio:   "Working on long-term community products and open-source developer tooling.",
			followers: 1720000,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Founder at Hirkey Labs"},
				{Type: "education", Desc: "Computer Science"},
				{Type: "location", Desc: "San Francisco, CA"},
			},
		},
		{
			username:  "ada",
			firstName: "Ada",
			lastName:  "Lovelace",
			shortBio:  "Math, systems, and elegant abstractions.",
			longBio:   "Focused on computational thinking, architecture design, and readable code.",
			followers: 852341,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Principal Engineer"},
				{Type: "education", Desc: "Applied Mathematics"},
				{Type: "location", Desc: "Austin, TX"},
			},
		},
		{
			username:  "grace",
			firstName: "Grace",
			lastName:  "Hopper",
			shortBio:  "Compilers, standards, and reliability.",
			longBio:   "Interested in language design, observability, and resilient backend systems.",
			followers: 937420,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Infrastructure Lead"},
				{Type: "education", Desc: "Mathematics"},
				{Type: "location", Desc: "Seattle, WA"},
			},
		},
		{
			username:  "linus",
			firstName: "Linus",
			lastName:  "Torvalds",
			shortBio:  "Kernel-level pragmatist.",
			longBio:   "Maintains low-level systems code and performance-heavy runtime services.",
			followers: 1201134,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Systems Engineer"},
				{Type: "education", Desc: "Computer Science"},
				{Type: "location", Desc: "Portland, OR"},
			},
		},
		{
			username:  "katherine",
			firstName: "Katherine",
			lastName:  "Johnson",
			shortBio:  "Precision at scale.",
			longBio:   "Designs analytics pipelines and models for large social and graph datasets.",
			followers: 614290,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Data Scientist"},
				{Type: "education", Desc: "Applied Mathematics"},
				{Type: "location", Desc: "Raleigh, NC"},
			},
		},
		{
			username:  "alan",
			firstName: "Alan",
			lastName:  "Turing",
			shortBio:  "Theory meets practical systems.",
			longBio:   "Focused on algorithmic foundations, distributed compute, and secure protocols.",
			followers: 705842,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Research Engineer"},
				{Type: "education", Desc: "Mathematics"},
				{Type: "location", Desc: "Boston, MA"},
			},
		},
		{
			username:  "margaret",
			firstName: "Margaret",
			lastName:  "Hamilton",
			shortBio:  "Reliable software, mission-critical mindset.",
			longBio:   "Building resilient release processes and high-availability application services.",
			followers: 689421,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Reliability Director"},
				{Type: "education", Desc: "Mathematics"},
				{Type: "location", Desc: "Denver, CO"},
			},
		},
		{
			username:  "tim",
			firstName: "Tim",
			lastName:  "Berners-Lee",
			shortBio:  "Open protocols and interoperable products.",
			longBio:   "Working on web standards, APIs, and portable identity systems.",
			followers: 920650,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Staff Architect"},
				{Type: "education", Desc: "Physics"},
				{Type: "location", Desc: "New York, NY"},
			},
		},
		{
			username:  "dennis",
			firstName: "Dennis",
			lastName:  "Ritchie",
			shortBio:  "Small tools, sharp abstractions.",
			longBio:   "Maintains foundational services and toolchains with performance constraints.",
			followers: 576203,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Platform Engineer"},
				{Type: "education", Desc: "Computer Science"},
				{Type: "location", Desc: "Chicago, IL"},
			},
		},
		{
			username:  "barbara",
			firstName: "Barbara",
			lastName:  "Liskov",
			shortBio:  "Correctness and composability.",
			longBio:   "Designing maintainable interfaces and type-safe contracts across services.",
			followers: 481399,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Principal Architect"},
				{Type: "education", Desc: "Computer Science"},
				{Type: "location", Desc: "Cambridge, MA"},
			},
		},
		{
			username:  "guido",
			firstName: "Guido",
			lastName:  "Rossum",
			shortBio:  "Readable code scales teams.",
			longBio:   "Improving developer velocity with better tooling, docs, and API ergonomics.",
			followers: 804110,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Developer Experience Lead"},
				{Type: "education", Desc: "Computer Science"},
				{Type: "location", Desc: "San Diego, CA"},
			},
		},
		{
			username:  "james",
			firstName: "James",
			lastName:  "Gosling",
			shortBio:  "Runtime performance and portability.",
			longBio:   "Building services that stay fast under load while keeping deployment portable.",
			followers: 548233,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Runtime Engineer"},
				{Type: "education", Desc: "Computer Science"},
				{Type: "location", Desc: "Phoenix, AZ"},
			},
		},
		{
			username:  "donald",
			firstName: "Donald",
			lastName:  "Knuth",
			shortBio:  "Algorithms with measurable outcomes.",
			longBio:   "Working on indexing, ranking, and relevance scoring for large datasets.",
			followers: 492778,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Search Engineer"},
				{Type: "education", Desc: "Mathematics"},
				{Type: "location", Desc: "Palo Alto, CA"},
			},
		},
		{
			username:  "ken",
			firstName: "Ken",
			lastName:  "Thompson",
			shortBio:  "Lean systems, strong defaults.",
			longBio:   "Focused on backend simplicity, secure-by-default behavior, and fast execution.",
			followers: 533029,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Backend Lead"},
				{Type: "education", Desc: "Electrical Engineering"},
				{Type: "location", Desc: "Salt Lake City, UT"},
			},
		},
		{
			username:  "radia",
			firstName: "Radia",
			lastName:  "Perlman",
			shortBio:  "Networks that fail gracefully.",
			longBio:   "Designing communication patterns and service routing that remain stable at scale.",
			followers: 466745,
			detailRows: []ProfileDetail{
				{Type: "career", Desc: "Networking Specialist"},
				{Type: "education", Desc: "Computer Science"},
				{Type: "location", Desc: "Atlanta, GA"},
			},
		},
	}

	postsByUsername := map[string][]mockPostSeed{
		"zuck1": {
			{text: "Shipping a clean search experience with typo tolerance this week.", hasImage: false},
			{
				text: "Prototype of the refreshed mobile chat composer is now live.",
				attachments: []mockPostAttachment{
					{attachmentType: "image", url: "https://picsum.photos/id/1015/1280/960"},
					{attachmentType: "image", url: "https://picsum.photos/id/1025/1280/960"},
					{attachmentType: "video", url: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4"},
				},
			},
			{text: "Hardening session expiry logic so cookies and server state stay aligned.", hasImage: false},
		},
		"ada": {
			{text: "Keeping interfaces small makes frontends easier to reason about.", hasImage: false},
			{
				text: "New profile settings refactor complete. Next up: stronger validations.",
				attachments: []mockPostAttachment{
					{attachmentType: "video", url: "https://samplelib.com/lib/preview/mp4/sample-10s.mp4"},
					{attachmentType: "video", url: "https://samplelib.com/lib/preview/mp4/sample-15s.mp4"},
					{attachmentType: "image", url: "https://picsum.photos/id/1035/1280/960"},
				},
			},
			{text: "Batch endpoints are a strong default when pages render many entities.", hasImage: false},
		},
		"grace": {
			{text: "Comment API now supports fast retrieval by rel_id with stable sort order.", hasImage: false},
			{text: "Auth flow cleanup pass done. Ready for 2FA provider integration.", hasImage: true},
			{
				text: "Observability first: useful logs beat noisy logs every time.",
				attachments: []mockPostAttachment{
					{attachmentType: "image", url: "https://picsum.photos/id/1059/1280/960"},
					{attachmentType: "video", url: "https://samplelib.com/lib/preview/mp4/sample-20s.mp4"},
				},
			},
		},
		"linus": {
			{text: "Defaulting to simple data models keeps maintenance costs low.", hasImage: false},
			{text: "UI theme pass done for dark mode contrast and accessibility.", hasImage: true},
			{text: "Reduced endpoint overhead with reusable helpers in api.go.", hasImage: false},
		},
		"katherine": {
			{text: "Tested search quality on mixed first/last-name inputs and misspellings.", hasImage: false},
			{text: "Added profile imagery and message metadata for better context.", hasImage: true},
			{text: "Performance note: prefer bounded limits for all list endpoints.", hasImage: false},
		},
		"alan": {
			{text: "Evaluating endpoint latency under concurrent feed and chat loads.", hasImage: false},
			{text: "Experimenting with deterministic IDs for safer data seeding in staging.", hasImage: true},
			{text: "Building small, composable handlers makes reviews faster.", hasImage: false},
		},
		"margaret": {
			{text: "Release checklist updates reduced deployment issues this sprint.", hasImage: false},
			{text: "Shipped stronger retries and clearer API error surfaces.", hasImage: true},
			{text: "Reliability work is mostly removing ambiguity.", hasImage: false},
		},
		"tim": {
			{text: "Improved URL semantics for share targets across mobile and desktop.", hasImage: false},
			{text: "Working on API consistency between profile and feed payloads.", hasImage: true},
			{text: "Interop first: standard field names prevent frontend drift.", hasImage: false},
		},
		"dennis": {
			{text: "Refactoring old helpers into narrow reusable utilities.", hasImage: false},
			{text: "Benchmarking message-list rendering after batching state lookups.", hasImage: true},
			{text: "Clear data models reduce production surprises.", hasImage: false},
		},
		"barbara": {
			{text: "Contract tests now cover optional and required fields separately.", hasImage: false},
			{text: "UI parity pass complete for dark mode tokens in modal views.", hasImage: true},
			{text: "Simple interfaces outperform clever ones over time.", hasImage: false},
		},
		"guido": {
			{text: "Tightened frontend module boundaries to keep responsibilities clear.", hasImage: false},
			{text: "Improved error messaging for profile edit and password update flows.", hasImage: true},
			{text: "Readable code makes on-call easier for everyone.", hasImage: false},
		},
		"james": {
			{text: "Reducing payload size in timeline responses cut load times noticeably.", hasImage: false},
			{text: "Testing client-side caching strategy for profile and post lookups.", hasImage: true},
			{text: "Latency wins often come from less data, not more hardware.", hasImage: false},
		},
		"donald": {
			{text: "Search ranking tweaks now weigh exact username matches higher.", hasImage: false},
			{text: "Added typo-tolerant scoring pass to improve discoverability.", hasImage: true},
			{text: "Relevance tuning is iterative and measurement-driven.", hasImage: false},
		},
		"ken": {
			{text: "Session middleware cleanup done; cookie behavior now predictable.", hasImage: false},
			{text: "Hardening backend defaults before adding new feature surface area.", hasImage: true},
			{text: "Small incremental changes are easier to validate than rewrites.", hasImage: false},
		},
		"radia": {
			{text: "Polling intervals tuned to reduce message staleness without extra load.", hasImage: false},
			{text: "Evaluating websocket fallback paths by client capability.", hasImage: true},
			{text: "Network-aware UX keeps chat responsive under variable conditions.", hasImage: false},
		},
	}

	videoAttachmentPool := []string{
		"https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
		"https://samplelib.com/lib/preview/mp4/sample-10s.mp4",
		"https://samplelib.com/lib/preview/mp4/sample-15s.mp4",
		"https://samplelib.com/lib/preview/mp4/sample-20s.mp4",
	}
	extraPostTextPool := []string{
		"Field update from this week.",
		"Ops checkpoint and release notes.",
		"Short product walkthrough clip.",
		"Recruiting progress and next actions.",
		"Feature quality pass summary.",
		"Daily build and validation log.",
	}

	for profileIndex, profileSeed := range profileSeeds {
		username := profileSeed.username
		basePosts := postsByUsername[username]

		for extraIndex := 0; extraIndex < 5; extraIndex++ {
			videoPrimary := videoAttachmentPool[(profileIndex+extraIndex)%len(videoAttachmentPool)]
			videoSecondary := videoAttachmentPool[(profileIndex+extraIndex+1)%len(videoAttachmentPool)]

			attachments := []mockPostAttachment{
				{attachmentType: "video", url: videoPrimary},
			}
			if (profileIndex+extraIndex)%2 == 0 {
				attachments = append(attachments, mockPostAttachment{
					attachmentType: "video",
					url:            videoSecondary,
				})
			}
			if extraIndex%2 == 0 {
				attachments = append(attachments, mockPostAttachment{
					attachmentType: "image",
					url: randomPicsumURL(
						rng,
						fmt.Sprintf("post-extra-image-%s-%d", username, extraIndex+1),
						1280,
						960,
					),
				})
			}

			postText := fmt.Sprintf(
				"%s #%d",
				extraPostTextPool[(profileIndex+extraIndex)%len(extraPostTextPool)],
				extraIndex+1,
			)
			basePosts = append(basePosts, mockPostSeed{
				text:        postText,
				attachments: attachments,
			})
		}

		postsByUsername[username] = basePosts
	}

	profilesCollection := client.Database(DBName).Collection("profiles")
	postsCollection := client.Database(DBName).Collection("posts")

	for index, seed := range profileSeeds {
		profileDoc := ProfileData{}
		if seedProfiles {
			profileID := randomObjectIDFromSeed(rng, seed.username)
			createdTime := int(now) - ((index + 30) * 86400)

			profileDoc = ProfileData{
				Id:                profileID,
				Username:          seed.username,
				FirstName:         seed.firstName,
				LastName:          seed.lastName,
				ProfilePictureURL: randomPicsumURL(rng, "profile-picture-"+seed.username, 320, 320),
				ProfileBannerURL:  randomPicsumURL(rng, "profile-banner-"+seed.username, 1400, 420),
				ShortDescription:  seed.shortBio,
				LongDescription:   seed.longBio,
				CreatedTime:       createdTime,
				Followers:         seed.followers,
				Details:           seed.detailRows,
			}

			profileFilter := bson.M{"username": profileDoc.Username}
			profileSetDoc := bson.M{
				"username":            profileDoc.Username,
				"first_name":          profileDoc.FirstName,
				"last_name":           profileDoc.LastName,
				"profile_picture_url": profileDoc.ProfilePictureURL,
				"profile_banner_url":  profileDoc.ProfileBannerURL,
				"short_description":   profileDoc.ShortDescription,
				"long_description":    profileDoc.LongDescription,
				"followers":           profileDoc.Followers,
				"created_time":        profileDoc.CreatedTime,
				"details":             profileDoc.Details,
			}
			profileSetOnInsertDoc := bson.M{
				"_id": profileDoc.Id,
			}

			err := upsertMockDocumentWithDuplicateFallback(
				ctx,
				profilesCollection,
				profileFilter,
				profileSetDoc,
				profileSetOnInsertDoc,
			)
			if err != nil {
				return err
			}
		} else if seedPosts {
			err := profilesCollection.FindOne(
				ctx,
				bson.M{"username": seed.username},
				options.FindOne().SetProjection(bson.M{
					"_id":                 1,
					"username":            1,
					"first_name":          1,
					"last_name":           1,
					"profile_picture_url": 1,
				}),
			).Decode(&profileDoc)
			if err != nil {
				continue
			}
		}

		if seedPosts == false {
			continue
		}
		if profileDoc.Id.IsZero() {
			continue
		}

		postSeeds, ok := postsByUsername[seed.username]
		if !ok {
			continue
		}

		for postIndex, postSeed := range postSeeds {
			postCreatedTime := int(now) - ((index * 7200) + (postIndex * 2400))
			postAttachments := make([]PostAttachment, 0)
			if len(postSeed.attachments) > 0 {
				for _, attachmentSeed := range postSeed.attachments {
					attachmentType := strings.ToLower(sanitizeString(attachmentSeed.attachmentType, false))
					if attachmentType != "image" && attachmentType != "video" {
						continue
					}
					attachmentURL := sanitizeString(attachmentSeed.url, true)
					if attachmentURL == "" {
						continue
					}
					postAttachments = append(postAttachments, PostAttachment{
						Type: attachmentType,
						URL:  attachmentURL,
					})
				}
			} else if postSeed.hasImage {
				postAttachments = append(postAttachments, PostAttachment{
					Type: "image",
					URL: randomPicsumURL(
						rng,
						fmt.Sprintf("post-image-%s-%d", seed.username, postIndex+1),
						1280,
						960,
					),
				})
			}

			likeCount := rng.Intn(4500) + 120
			if seed.followers > 0 {
				likeCount += (seed.followers / 1800) + rng.Intn(220)
			}
			commentCount := (likeCount / 7) + rng.Intn(80)
			repostCount := (likeCount / 11) + rng.Intn(40)
			viewCount := (likeCount * (rng.Intn(5) + 8)) + rng.Intn(500)
			shareCount := (likeCount / 13) + rng.Intn(30)
			saveCount := (likeCount / 10) + rng.Intn(35)

			postDoc := PostData{
				Id:                randomObjectIDFromSeed(rng, fmt.Sprintf("%s-%d", seed.username, postIndex+1)),
				ProfileID:         profileDoc.Id,
				RelID:             profileDoc.Id,
				Username:          profileDoc.Username,
				FirstName:         profileDoc.FirstName,
				LastName:          profileDoc.LastName,
				ProfilePictureURL: profileDoc.ProfilePictureURL,
				PostText:          postSeed.text,
				Attachments:       postAttachments,
				CreatedTime:       postCreatedTime,
				LikeCount:         likeCount,
				CommentCount:      commentCount,
				RepostCount:       repostCount,
				ViewCount:         viewCount,
				ShareCount:        shareCount,
				SaveCount:         saveCount,
			}

			postFilter := bson.M{
				"profile_id": postDoc.ProfileID,
				"post_text":  postDoc.PostText,
			}
			postSetDoc := bson.M{
				"profile_id":          postDoc.ProfileID,
				"rel_id":              postDoc.RelID,
				"username":            postDoc.Username,
				"first_name":          postDoc.FirstName,
				"last_name":           postDoc.LastName,
				"profile_picture_url": postDoc.ProfilePictureURL,
				"post_text":           postDoc.PostText,
				"attachments":         postDoc.Attachments,
				"created_time":        postDoc.CreatedTime,
				"like_count":          postDoc.LikeCount,
				"comment_count":       postDoc.CommentCount,
				"repost_count":        postDoc.RepostCount,
				"view_count":          postDoc.ViewCount,
				"share_count":         postDoc.ShareCount,
				"save_count":          postDoc.SaveCount,
			}
			postSetOnInsertDoc := bson.M{
				"_id": postDoc.Id,
			}

			err := upsertMockDocumentWithDuplicateFallback(
				ctx,
				postsCollection,
				postFilter,
				postSetDoc,
				postSetOnInsertDoc,
			)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

// upsertMockDocumentWithDuplicateFallback performs an upsert operation on a MongoDB collection,
// handling duplicate key errors by falling back to a direct update or re-insert with the
// expected _id value.
func upsertMockDocumentWithDuplicateFallback(
	ctx context.Context,
	collection *mongo.Collection,
	filter bson.M,
	setDoc bson.M,
	setOnInsertDoc bson.M,
) error {
	updateDoc := bson.M{
		"$set": setDoc,
	}
	if len(setOnInsertDoc) > 0 {
		updateDoc["$setOnInsert"] = setOnInsertDoc
	}

	_, err := collection.UpdateOne(
		ctx,
		filter,
		updateDoc,
		options.Update().SetUpsert(true),
	)
	if err == nil {
		return nil
	}
	if !mongo.IsDuplicateKeyError(err) {
		return err
	}

	updateResult, retryErr := collection.UpdateOne(
		ctx,
		filter,
		bson.M{"$set": setDoc},
	)
	if retryErr == nil && updateResult.MatchedCount > 0 {
		return nil
	}

	insertedID, hasInsertedID := setOnInsertDoc["_id"]
	if hasInsertedID {
		_, idRetryErr := collection.UpdateOne(
			ctx,
			bson.M{"_id": insertedID},
			bson.M{"$set": setDoc},
			options.Update().SetUpsert(true),
		)
		if idRetryErr == nil {
			return nil
		}
	}

	if retryErr != nil {
		return retryErr
	}
	return err
}

// mockPostSeed defines the template data for a single mock post.
type mockPostSeed struct {
	text        string
	hasImage    bool
	attachments []mockPostAttachment
}

// mockPostAttachment defines a media attachment within a mock post.
type mockPostAttachment struct {
	attachmentType string
	url            string
}

// randomPicsumURL generates a deterministic Picsum Photos URL for a mock image,
// using the provided seed prefix and dimensions.
func randomPicsumURL(rng *rand.Rand, prefix string, width int, height int) string {
	seedValue := fmt.Sprintf("%s-%d", prefix, rng.Int63())
	return fmt.Sprintf("https://picsum.photos/seed/%s/%d/%d", seedValue, width, height)
}

// randomObjectIDFromSeed generates a pseudo-deterministic MongoDB ObjectID
// from the given seed prefix for reproducible mock data seeding.
func randomObjectIDFromSeed(rng *rand.Rand, prefix string) primitive.ObjectID {
	var id primitive.ObjectID
	randomStr := fmt.Sprintf("%s-%d", prefix, rng.Int63())
	copy(id[:], []byte(randomStr))
	for index := len(randomStr); index < len(id); index += 1 {
		id[index] = byte(rng.Intn(255))
	}
	return id
}
