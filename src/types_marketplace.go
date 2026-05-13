package main

import "go.mongodb.org/mongo-driver/bson/primitive"

// MarketplaceListingEntry represents a marketplace listing document
// in the marketplace_listings MongoDB collection.
type MarketplaceListingEntry struct {
	Id          primitive.ObjectID `bson:"_id,omitempty"`
	ProfileID   primitive.ObjectID `bson:"profile_id"`
	Title       string             `bson:"title"`
	Description string             `bson:"description"`
	Price       int                `bson:"price"`
	Currency    string             `bson:"currency"`
	Location    string             `bson:"location"`
	Category    string             `bson:"category"`
	Condition   string             `bson:"condition"`
	ImageURL    string             `bson:"image_url"`
	ImageURLs   []string           `bson:"image_urls"`
	CreatedTime int64              `bson:"created_time"`
}

// MarketplaceListingData is the serialized form of a marketplace listing for API responses,
// including resolved seller information.
type MarketplaceListingData struct {
	Id              string   `json:"_id"`
	ProfileID       string   `json:"profile_id"`
	SellerUsername  string   `json:"seller_username"`
	SellerFirstName string   `json:"seller_first_name"`
	SellerLastName  string   `json:"seller_last_name"`
	Title           string   `json:"title"`
	Description     string   `json:"description"`
	Price           int      `json:"price"`
	Currency        string   `json:"currency"`
	Location        string   `json:"location"`
	Category        string   `json:"category"`
	Condition       string   `json:"condition"`
	ImageURL        string   `json:"image_url"`
	ImageURLs       []string `json:"image_urls"`
	CreatedTime     int64    `json:"created_time"`
}

// MarketplaceListingListResponse is the JSON response returned by the marketplace list API.
type MarketplaceListingListResponse struct {
	Query    string                   `json:"query"`
	Listings []MarketplaceListingData `json:"listings"`
}

// MarketplaceCreateRequest represents the JSON body for creating a new marketplace listing.
type MarketplaceCreateRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Price       int      `json:"price"`
	Currency    string   `json:"currency"`
	Location    string   `json:"location"`
	Category    string   `json:"category"`
	Condition   string   `json:"condition"`
	ImageURL    string   `json:"image_url"`
	ImageURLs   []string `json:"image_urls"`
}

// MarketplaceCreateResponse is the JSON response returned after creating a new marketplace listing.
type MarketplaceCreateResponse struct {
	Message string                 `json:"message"`
	Listing MarketplaceListingData `json:"listing"`
}
