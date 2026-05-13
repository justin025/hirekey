package main

import "go.mongodb.org/mongo-driver/bson/primitive"

// CommentEntry represents a comment document in the comments MongoDB collection.
type CommentEntry struct {
	ID              primitive.ObjectID `bson:"_id,omitempty"`
	RelID           string             `bson:"rel_id"`
	AuthorProfileID primitive.ObjectID `bson:"author_profile_id"`
	CommentContent  string             `bson:"comment_content"`
	Time            int64              `bson:"time"`
}

// CommentCreateRequest represents the JSON body for creating a new comment.
type CommentCreateRequest struct {
	RelID          string `json:"rel_id"`
	CommentContent string `json:"comment_content"`
}

// CommentData is the serialized form of a comment for API responses,
// including resolved username fields.
type CommentData struct {
	ID              string `json:"_id"`
	RelID           string `json:"rel_id"`
	AuthorProfileID string `json:"author_profile_id"`
	Username        string `json:"username"`
	CommentContent  string `json:"comment_content"`
	Time            int64  `json:"time"`
}

// CommentListResponse is the JSON response returned by the comment list API.
type CommentListResponse struct {
	RelID    string        `json:"rel_id"`
	Comments []CommentData `json:"comments"`
}

// CommentCreateResponse is the JSON response returned after creating a new comment.
type CommentCreateResponse struct {
	RelID   string      `json:"rel_id"`
	Comment CommentData `json:"comment"`
}
