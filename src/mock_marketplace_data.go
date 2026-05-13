package main

// Package main provides mock marketplace listing data seeding for HireKey's marketplace feature.

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// mockMarketplaceListingSeed defines the template data for a mock marketplace listing.
type mockMarketplaceListingSeed struct {
	title       string
	description string
	price       int
	location    string
	category    string
	condition   string
}

// seedMockMarketplaceData seeds mock marketplace listing records into MongoDB for demo purposes.
func seedMockMarketplaceData(ctx context.Context) error {
	rng := randomSeededRng(time.Now().UnixNano())

	listingSeeds := []mockMarketplaceListingSeed{
		{title: "Downtown Office Sublease - 2,100 sq ft", description: "Turnkey office with 5 private rooms, boardroom, and kitchenette. Utilities included. Available immediately.", price: 7800, location: "King West, Toronto, ON", category: "Office Space", condition: "Sublease"},
		{title: "Retail Unit on Queen Street - 1,200 sq ft", description: "High-traffic retail frontage with full glass storefront and storage in rear. Ideal for boutique or café.", price: 6200, location: "Queen West, Toronto, ON", category: "Retail Lease", condition: "For Lease"},
		{title: "Medical Office - 6 Exam Rooms", description: "Professionally built medical suite with reception area and accessible washroom in busy plaza.", price: 9300, location: "North York, Toronto, ON", category: "Medical Office", condition: "For Lease"},
		{title: "Industrial Flex Space - 4,500 sq ft", description: "Warehouse plus front office, grade-level shipping door, and 18-foot clear height.", price: 11200, location: "Etobicoke, ON", category: "Industrial Lease", condition: "For Lease"},
		{title: "Coworking Private Suite - 14 Desks", description: "Furnished private suite inside premium coworking building. Meeting room credits included monthly.", price: 5400, location: "Liberty Village, Toronto, ON", category: "Coworking", condition: "For Rent"},
		{title: "Creative Studio Loft - 1,600 sq ft", description: "Open-concept loft with exposed brick and natural light. Great for agency, design studio, or production.", price: 4700, location: "Leslieville, Toronto, ON", category: "Office Space", condition: "For Rent"},
		{title: "Ground Floor Commercial Unit - 900 sq ft", description: "Street-level commercial unit with upgraded HVAC and renovated washroom. Flexible lease terms.", price: 3900, location: "Mississauga, ON", category: "Commercial Unit", condition: "For Lease"},
		{title: "Corporate Office Floor - 8,800 sq ft", description: "Full floor with elevator exposure, conference rooms, and executive offices. Parking available.", price: 28400, location: "Markham, ON", category: "Office Space", condition: "For Lease"},
		{title: "Salon / Spa Ready Unit - 1,050 sq ft", description: "Plumbed and partitioned for salon operations. Located in established neighborhood commercial strip.", price: 4400, location: "Scarborough, Toronto, ON", category: "Retail Lease", condition: "For Lease"},
		{title: "Restaurant Shell - 2,700 sq ft", description: "Former restaurant location with venting and patio rights. Opportunity for quick restaurant conversion.", price: 12500, location: "Vaughan, ON", category: "Hospitality Lease", condition: "For Lease"},
		{title: "Professional Office - 3,200 sq ft", description: "Class A office suite with built-in workstations, reception, and two meeting rooms.", price: 9900, location: "Oakville, ON", category: "Office Space", condition: "Sublease"},
		{title: "Training Center Space - 5 Classrooms", description: "Large instructional space with secure access, washrooms on floor, and dedicated IT room.", price: 8600, location: "Richmond Hill, ON", category: "Education / Training", condition: "For Rent"},
		{title: "Small Business Office - 780 sq ft", description: "Affordable office with one private room and open workspace. Good fit for accounting or legal services.", price: 2900, location: "Brampton, ON", category: "Office Space", condition: "For Rent"},
		{title: "Tech Office Hub - 3,900 sq ft", description: "Modern fit-out with podcast room, quiet booths, and collaborative zones. Fiber internet available.", price: 13700, location: "Waterfront, Toronto, ON", category: "Office Space", condition: "For Lease"},
		{title: "Corner Retail + Office Combo - 1,850 sq ft", description: "Corner exposure with retail storefront and rear office area. Great for service businesses.", price: 7100, location: "Burlington, ON", category: "Mixed Commercial", condition: "For Lease"},
	}

	profilesCollection := client.Database(DBName).Collection("profiles")
	profileCursor, err := profilesCollection.Find(
		ctx,
		bson.M{},
		options.Find().
			SetProjection(bson.M{"_id": 1}).
			SetSort(bson.D{{Key: "created_time", Value: 1}, {Key: "_id", Value: 1}}).
			SetLimit(200),
	)
	if err != nil {
		return err
	}
	defer profileCursor.Close(ctx)

	type mockMarketplaceProfileIDEntry struct {
		Id primitive.ObjectID `bson:"_id"`
	}

	profileIDs := make([]primitive.ObjectID, 0, 200)
	for profileCursor.Next(ctx) {
		var entry mockMarketplaceProfileIDEntry
		if decodeErr := profileCursor.Decode(&entry); decodeErr != nil {
			continue
		}
		if entry.Id.IsZero() {
			continue
		}
		profileIDs = append(profileIDs, entry.Id)
	}
	if err := profileCursor.Err(); err != nil {
		return err
	}
	if len(profileIDs) == 0 {
		return nil
	}

	listingsCollection := client.Database(DBName).Collection("marketplace_listings")
	nowUnix := time.Now().Unix()

	for index, seed := range listingSeeds {
		profileID := profileIDs[index%len(profileIDs)]
		if profileID.IsZero() {
			continue
		}

		title := sanitizeString(seed.title, true)
		description := sanitizeString(seed.description, true)
		location := sanitizeString(seed.location, true)
		category := sanitizeString(seed.category, true)
		condition := sanitizeString(seed.condition, true)
		imageURLs := make([]string, 0, 4)
		for imageIndex := 0; imageIndex < 4; imageIndex += 1 {
			imageSeed := fmt.Sprintf("marketplace-%s-%d", toSeedToken(seed.title), imageIndex+1)
			imageURLs = append(
				imageURLs,
				sanitizeString(randomPicsumURL(rng, imageSeed, 1280, 720), true),
			)
		}
		imageURL := ""
		if len(imageURLs) > 0 {
			imageURL = imageURLs[0]
		}
		createdTime := nowUnix - int64(index*3600)

		listingFilter := bson.M{
			"profile_id": profileID,
			"title":      title,
			"location":   location,
		}
		listingSetDoc := bson.M{
			"profile_id":   profileID,
			"title":        title,
			"description":  description,
			"price":        seed.price,
			"currency":     "CAD",
			"location":     location,
			"category":     category,
			"condition":    condition,
			"image_url":    imageURL,
			"image_urls":   imageURLs,
			"created_time": createdTime,
		}
		listingSetOnInsertDoc := bson.M{}

		err := upsertMockDocumentWithDuplicateFallback(
			ctx,
			listingsCollection,
			listingFilter,
			listingSetDoc,
			listingSetOnInsertDoc,
		)
		if err != nil {
			return err
		}
	}

	return nil
}
