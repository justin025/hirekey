package main

import "go.mongodb.org/mongo-driver/bson/primitive"

// InteractionEntry represents a user interaction (like, follow, share, repost, save)
// document in the interactions MongoDB collection.
type InteractionEntry struct {
	RelID     string             `bson:"rel_id"`
	ProfileID primitive.ObjectID `bson:"profile_id"`
	Time      int64              `bson:"time"`
}

// InteractionToggleRequest represents the JSON body for toggling an interaction
// (like, follow, share, repost, or save) on a post or profile.
type InteractionToggleRequest struct {
	RelID string `json:"rel_id"`
}

// LikeStateResponse is the JSON response indicating whether the current user
// has liked the specified post or content.
type LikeStateResponse struct {
	RelID   string `json:"rel_id"`
	IsLiked bool   `json:"is_liked"`
}

// FollowStateResponse is the JSON response indicating whether the current user
// is following the specified profile.
type FollowStateResponse struct {
	RelID      string `json:"rel_id"`
	IsFollowed bool   `json:"is_followed"`
}

// ShareStateResponse is the JSON response indicating whether the current user
// has shared the specified post.
type ShareStateResponse struct {
	RelID    string `json:"rel_id"`
	IsShared bool   `json:"is_shared"`
}

// RepostStateResponse is the JSON response indicating whether the current user
// has reposted the specified post.
type RepostStateResponse struct {
	RelID      string `json:"rel_id"`
	IsReposted bool   `json:"is_reposted"`
}

// SaveStateResponse is the JSON response indicating whether the current user
// has saved the specified post.
type SaveStateResponse struct {
	RelID   string `json:"rel_id"`
	IsSaved bool   `json:"is_saved"`
}

// InteractionStateBatchRequest represents the JSON body for batch-checking
// interaction states across multiple posts or profiles.
type InteractionStateBatchRequest struct {
	RelIDs []string `json:"rel_ids"`
}

// LikeStateBatchResponse is the JSON response for batch-liked state lookups.
type LikeStateBatchResponse struct {
	IsLiked map[string]bool `json:"is_liked"`
}

// FollowStateBatchResponse is the JSON response for batch-followed state lookups.
type FollowStateBatchResponse struct {
	IsFollowed map[string]bool `json:"is_followed"`
}

// ShareStateBatchResponse is the JSON response for batch-shared state lookups.
type ShareStateBatchResponse struct {
	IsShared map[string]bool `json:"is_shared"`
}

// RepostStateBatchResponse is the JSON response for batch-reposted state lookups.
type RepostStateBatchResponse struct {
	IsReposted map[string]bool `json:"is_reposted"`
}

// SaveStateBatchResponse is the JSON response for batch-saved state lookups.
type SaveStateBatchResponse struct {
	IsSaved map[string]bool `json:"is_saved"`
}

// PostViewResponse is the JSON response indicating whether the current user
// has viewed a specific post.
type PostViewResponse struct {
	RelID    string `json:"rel_id"`
	IsViewed bool   `json:"is_viewed"`
}
