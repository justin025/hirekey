.PHONY: build test docker-build docker-up docker-down lint clean

APP_NAME := hirekey
BUILD_DIR := ./build
MODULE := hirekey

# Build the application
build:
	@echo "==> Building $(APP_NAME)..."
	@mkdir -p $(BUILD_DIR)
	@CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o $(BUILD_DIR)/$(APP_NAME) ./cmd/server/
	@echo "==> Build complete: $(BUILD_DIR)/$(APP_NAME)"

# Run locally (development)
run:
	@echo "==> Running $(APP_NAME) on :8080..."
	@go run ./cmd/server/

# Run docker-compose
docker-up:
	@echo "==> Starting containers..."
	@docker compose up -d
	@echo "==> App: http://localhost:8080"

# Stop docker-compose
docker-down:
	@echo "==> Stopping containers..."
	@docker compose down

# Full docker rebuild + start
docker-build:
	@echo "==> Building Docker image..."
	@docker compose build --no-cache
	@docker compose up -d

# Verify binary (static check)
check:
	@echo "==> Checking binary linkage..."
	@if [ -f $(BUILD_DIR)/$(APP_NAME) ]; then \
		ldd $(BUILD_DIR)/$(APP_NAME) 2>&1; \
		echo "==> Binary is statically compiled (CGO_ENABLED=0)"; \
	else \
		echo "Binary not found. Run 'make build' first."; \
		exit 1; \
	fi

# Clean build artifacts
clean:
	@echo "==> Cleaning..."
	@rm -rf $(BUILD_DIR)
	@echo "==> Done."

lint:
	@echo "==> Running go vet..."
	@go vet ./...
	@echo "==> Running go fmt check..."
	@go fmt ./...
