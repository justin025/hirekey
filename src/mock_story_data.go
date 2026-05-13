package main

// Package main provides mock story data seeding for HireKey's stories feature.
// Stories are ephemeral posts that expire after 24 hours.

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// mockStorySeed defines the template data for a mock story post.
type mockStorySeed struct {
	username    string
	storyText   string
	mediaWidth  int
	mediaHeight int
}

// seedMockStoryData seeds mock story records into MongoDB for demo purposes.
func seedMockStoryData(ctx context.Context) error {
	rng := randomSeededRng(time.Now().UnixNano())
	expiryTime := time.Date(2030, time.January, 1, 0, 0, 0, 0, time.UTC).Unix()
	createdTime := time.Now().Unix()

	storySeeds := []mockStorySeed{
		{username: "zuck1", storyText: "Shipping day. New features are live.", mediaWidth: 900, mediaHeight: 1600},
		{username: "ada", storyText: "Drafting clean API contracts for the next release.", mediaWidth: 900, mediaHeight: 1600},
		{username: "grace", storyText: "Monitoring deploy metrics and stability checks.", mediaWidth: 900, mediaHeight: 1600},
		{username: "linus", storyText: "Kernel notes and performance wins this week.", mediaWidth: 900, mediaHeight: 1600},
		{username: "katherine", storyText: "Reviewing analytics quality before rollout.", mediaWidth: 900, mediaHeight: 1600},
		{username: "margaret", storyText: "Reliability sprint updates posted.", mediaWidth: 900, mediaHeight: 1600},
		{username: "tim", storyText: "Protocol discussions from today’s session.", mediaWidth: 900, mediaHeight: 1600},
		{username: "radia", storyText: "Routing improvements validated in staging.", mediaWidth: 900, mediaHeight: 1600},
	}

	profilesCollection := client.Database(DBName).Collection("profiles")
	storiesCollection := client.Database(DBName).Collection("stories")

	type profileIDLookup struct {
		Id primitive.ObjectID `bson:"_id"`
	}

	for index, storySeed := range storySeeds {
		username := sanitizeString(storySeed.username, false)
		if username == "" {
			continue
		}

		var profileLookup profileIDLookup
		err := profilesCollection.FindOne(
			ctx,
			bson.M{"username": username},
			options.FindOne().SetProjection(bson.M{"_id": 1}),
		).Decode(&profileLookup)
		if err != nil {
			continue
		}
		if profileLookup.Id.IsZero() {
			continue
		}

		storyText := sanitizeString(storySeed.storyText, true)
		storyMediaURL := randomPicsumURL(
			rng,
			fmt.Sprintf("story-%s-%d", username, index+1),
			storySeed.mediaWidth,
			storySeed.mediaHeight,
		)

		storyFilter := bson.M{
			"profile_id": profileLookup.Id,
			"story_text": storyText,
		}
		storySetDoc := bson.M{
			"profile_id":      profileLookup.Id,
			"story_text":      storyText,
			"story_media_url": sanitizeString(storyMediaURL, true),
			"created_time":    createdTime - int64((index+1)*300),
			"expiry_time":     expiryTime,
		}
		storySetOnInsertDoc := bson.M{
			"_id": randomObjectIDFromSeed(rng, fmt.Sprintf("story-%s-%d", username, index+1)),
		}

		err = upsertMockDocumentWithDuplicateFallback(
			ctx,
			storiesCollection,
			storyFilter,
			storySetDoc,
			storySetOnInsertDoc,
		)
		if err != nil {
			return err
		}
	}

	return nil
}
