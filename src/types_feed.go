package main

// FeedPostCreateRequest represents the JSON body for creating a new post in the feed.
type FeedPostCreateRequest struct {
	PostText    string                            `json:"post_text"`
	Attachments []FeedPostCreateAttachmentRequest `json:"attachments"`
}

// FeedPostCreateAttachmentRequest represents a single media attachment in a post creation request.
type FeedPostCreateAttachmentRequest struct {
	Type string `json:"type"`
	URL  string `json:"url"`
}

// FeedPostCreateResponse is the JSON response returned after creating a new post.
type FeedPostCreateResponse struct {
	Message string   `json:"message"`
	Post    PostData `json:"post"`
}
