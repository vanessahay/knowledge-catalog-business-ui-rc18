#!/bin/sh

ASSETS_DIR=/app/dist/assets

if [ -d "$ASSETS_DIR" ]; then
  for file in "$ASSETS_DIR"/*.js; do
    if [ -f "$file" ]; then
      echo "Processing $file ..."
      sed -i "s|__VITE_API_URL__|${VITE_API_URL:-/api}|g" "$file"
      sed -i "s|__VITE_API_VERSION__|${VITE_API_VERSION:-v1}|g" "$file"
      sed -i "s|__VITE_ADMIN_EMAIL__|${VITE_ADMIN_EMAIL}|g" "$file"
      sed -i "s|__VITE_GOOGLE_PROJECT_ID__|${VITE_GOOGLE_PROJECT_ID}|g" "$file"
      sed -i "s|__VITE_GOOGLE_CLIENT_ID__|${VITE_GOOGLE_CLIENT_ID}|g" "$file"
      sed -i "s|__VITE_GOOGLE_REDIRECT_URI__|${VITE_GOOGLE_REDIRECT_URI:-/auth/google/callback}|g" "$file"
      sed -i "s|__VITE_IS_SERVICE_ACCOUNT__|${VITE_IS_SERVICE_ACCOUNT:-false}|g" "$file"
      sed -i "s|__VITE_FEATURE_REQUEST_ACCESS__|${VITE_FEATURE_REQUEST_ACCESS:-false}|g" "$file"
    fi
  done
fi

if [ -f "/app/dist/index.html" ]; then
  sed -i "s|__VITE_API_URL__|${VITE_API_URL:-/api}|g" /app/dist/index.html
fi

echo "env setup done and run npm"
exec npm start
