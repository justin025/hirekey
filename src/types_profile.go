package main

// Package main defines the core data types used by the HireKey application
// for MongoDB document mapping and API request/response serialization.

import "go.mongodb.org/mongo-driver/bson/primitive"

// ProfileDetail represents a key-value detail row on a user profile
// (e.g., career, education, location).
type ProfileDetail struct {
	Type string `bson:"type"`
	Desc string `bson:"desc"`
}

// ProfileData represents a user profile document in the profiles MongoDB collection.
// It stores both public profile information and computed metrics.
type ProfileData struct {
	Id                primitive.ObjectID `bson:"_id,omitempty"`
	Username          string             `bson:"username"`
	FirstName         string             `bson:"first_name"`
	LastName          string             `bson:"last_name"`
	ProfilePictureURL string             `bson:"profile_picture_url"`
	ProfileBannerURL  string             `bson:"profile_banner_url"`
	ShortDescription  string             `bson:"short_description"`
	LongDescription   string             `bson:"long_description"`
	CreatedTime       int                `bson:"created_time"`
	Followers         int                `bson:"followers"`
	Details           []ProfileDetail    `bson:"details"`
	HasActiveStory    bool               `bson:"-" json:"has_active_story"`
}

// PostData represents a post document in the posts MongoDB collection.
// It stores post content, media attachments, and engagement metrics.
type PostData struct {
	Id                primitive.ObjectID `bson:"_id,omitempty"`
	ProfileID         primitive.ObjectID `bson:"profile_id,omitempty"`
	RelID             primitive.ObjectID `bson:"rel_id,omitempty"`
	Username          string             `bson:"username"`
	FirstName         string             `bson:"first_name"`
	LastName          string             `bson:"last_name"`
	ProfilePictureURL string             `bson:"profile_picture_url"`
	PostText          string             `bson:"post_text"`
	Attachments       []PostAttachment   `bson:"attachments"`
	CreatedTime       int                `bson:"created_time"`
	LikeCount         int                `bson:"like_count"`
	CommentCount      int                `bson:"comment_count"`
	RepostCount       int                `bson:"repost_count"`
	ViewCount         int                `bson:"view_count"`
	ShareCount        int                `bson:"share_count"`
	SaveCount         int                `bson:"save_count"`
}

// PostAttachment represents a media attachment within a post (image or video).
type PostAttachment struct {
	Type string `bson:"type" json:"type"`
	URL  string `bson:"url" json:"url"`
}

// ProfileView is a composite template data structure used when rendering
// a user profile page, embedding the ProfileData, PostData (user posts), and PageData.
type ProfileView struct {
	PageData
	ProfileData
	PostData []PostData
}

// profilePictureLookupEntry is a MongoDB projection struct used for efficient
// profile picture URL lookups without fetching the full profile document.
type profilePictureLookupEntry struct {
	Id                primitive.ObjectID `bson:"_id,omitempty"`
	Username          string             `bson:"username"`
	FirstName         string             `bson:"first_name"`
	LastName          string             `bson:"last_name"`
	ProfilePictureURL string             `bson:"profile_picture_url"`
}
