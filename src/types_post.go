package main

// PostEditRequest represents the JSON body for editing an existing post.
type PostEditRequest struct {
	PostID   string `json:"post_id"`
	PostText string `json:"post_text"`
}

// PostDeleteRequest represents the JSON body for deleting a post.
type PostDeleteRequest struct {
	PostID string `json:"post_id"`
}

// PostEditResponse is the JSON response returned after editing a post.
type PostEditResponse struct {
	Message string   `json:"message"`
	Post    PostData `json:"post"`
}

// PostDeleteResponse is the JSON response returned after deleting a post.
type PostDeleteResponse struct {
	PostID  string `json:"post_id"`
	Message string `json:"message"`
}
