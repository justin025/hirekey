package main

import "go.mongodb.org/mongo-driver/bson/primitive"

// StoryEntry represents a story document in the stories MongoDB collection.
// Stories have a 24-hour TTL determined by created_time and expiry_time.
type StoryEntry struct {
	Id            primitive.ObjectID `bson:"_id,omitempty"`
	ProfileID     primitive.ObjectID `bson:"profile_id"`
	StoryText     string             `bson:"story_text"`
	StoryMediaURL string             `bson:"story_media_url"`
	CreatedTime   int64              `bson:"created_time"`
	ExpiryTime    int64              `bson:"expiry_time"`
}

// StoryData is the serialized form of a story for API responses.
type StoryData struct {
	Id            string `json:"_id"`
	ProfileID     string `json:"profile_id"`
	StoryText     string `json:"story_text"`
	StoryMediaURL string `json:"story_media_url"`
	CreatedTime   int64  `json:"created_time"`
	ExpiryTime    int64  `json:"expiry_time"`
}

// StoryCreateRequest represents the JSON body for creating a new story.
type StoryCreateRequest struct {
	StoryText     string `json:"story_text"`
	StoryMediaURL string `json:"story_media_url"`
}

// StoryCreateResponse is the JSON response returned after creating a new story.
type StoryCreateResponse struct {
	Message string    `json:"message"`
	Story   StoryData `json:"story"`
}

// StoryListResponse is the JSON response returned by the story list API.
type StoryListResponse struct {
	ProfileID      string      `json:"profile_id"`
	HasActiveStory bool        `json:"has_active_story"`
	Stories        []StoryData `json:"stories"`
}
