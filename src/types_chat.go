package main

import "go.mongodb.org/mongo-driver/bson/primitive"

// ChatMessageEntry represents a chat message document in the messages MongoDB collection.
type ChatMessageEntry struct {
	ID                 primitive.ObjectID `bson:"_id,omitempty"`
	SenderProfileID    primitive.ObjectID `bson:"sender_profile_id"`
	ReceivingProfileID primitive.ObjectID `bson:"receiving_profile_id"`
	ReadTime           int64              `bson:"read_time"`
	SentTime           int64              `bson:"sent_time"`
	MessageContent     string             `bson:"message_content"`
	IsAttachment       bool               `bson:"is_attachment"`
	AttachmentURL      string             `bson:"attachment_url"`
}

// ChatMessageAPI is the serialized form of a chat message for API responses,
// including resolved username fields alongside raw profile IDs.
type ChatMessageAPI struct {
	ID                 string `json:"_id"`
	SenderProfileID    string `json:"sender_profile_id"`
	ReceivingProfileID string `json:"receiving_profile_id"`
	SenderUsername     string `json:"sender_username"`
	ReceivingUsername  string `json:"receiving_username"`
	ReadTime           int64  `json:"read_time"`
	SentTime           int64  `json:"sent_time"`
	MessageContent     string `json:"message_content"`
	IsAttachment       bool   `json:"is_attachment"`
	AttachmentURL      string `json:"attachment_url"`
}

// ChatMessageListResponse is the JSON response returned by the chat message list API.
type ChatMessageListResponse struct {
	CurrentProfileID    string            `json:"current_profile_id"`
	CurrentUsername     string            `json:"current_username"`
	Messages            []ChatMessageAPI  `json:"messages"`
	ProfilePictureURLs  map[string]string `json:"profile_picture_urls"`
	ProfileUsernames    map[string]string `json:"profile_usernames"`
	ProfileDisplayNames map[string]string `json:"profile_display_names"`
}

// ChatMessageCreateRequest represents the JSON body for sending a new chat message.
type ChatMessageCreateRequest struct {
	ReceivingUsername string `json:"receiving_username"`
	MessageContent    string `json:"message_content"`
	IsAttachment      bool   `json:"is_attachment"`
	AttachmentURL     string `json:"attachment_url"`
}

// ChatMessageCreateResponse is the JSON response returned after sending a chat message.
type ChatMessageCreateResponse struct {
	CurrentProfileID    string            `json:"current_profile_id"`
	CurrentUsername     string            `json:"current_username"`
	Message             ChatMessageAPI    `json:"message"`
	ProfilePictureURLs  map[string]string `json:"profile_picture_urls"`
	ProfileUsernames    map[string]string `json:"profile_usernames"`
	ProfileDisplayNames map[string]string `json:"profile_display_names"`
}

// ChatMessageReadRequest represents the JSON body for marking messages as read.
type ChatMessageReadRequest struct {
	PeerProfileID string `json:"peer_profile_id"`
}

// ChatMessageReadResponse is the JSON response returned after marking messages as read.
type ChatMessageReadResponse struct {
	CurrentProfileID string `json:"current_profile_id"`
	PeerProfileID    string `json:"peer_profile_id"`
	ReadTime         int64  `json:"read_time"`
	UpdatedCount     int64  `json:"updated_count"`
}

// ChatUnreadResponse is the JSON response returned by the chat unread count API.
type ChatUnreadResponse struct {
	UnreadCount int64 `json:"unread_count"`
}
