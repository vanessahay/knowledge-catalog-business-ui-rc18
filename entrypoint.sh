#!/bin/sh

ASSETS_DIR=/app/dist/assets

if [ -d "$ASSETS_DIR" ]; then
  for file in "$ASSETS_DIR"/*.js; do
    if [ -f "$file" ]; then
      echo "Processing $file ..."
      sed -i "s|__VITE_API_URL__|${VITE_API_URL}|g" "$file"
      sed -i "s|__VITE_API_VERSION__|${VITE_API_VERSION}|g" "$file"
      sed -i "s|__VITE_ADMIN_EMAIL__|${VITE_ADMIN_EMAIL}|g" "$file"
      sed -i "s|__VITE_GOOGLE_PROJECT_ID__|${VITE_GOOGLE_PROJECT_ID}|g" "$file"
      sed -i "s|__VITE_GOOGLE_CLIENT_ID__|${VITE_GOOGLE_CLIENT_ID}|g" "$file"
      sed -i "s|__VITE_GOOGLE_REDIRECT_URI__|${VITE_GOOGLE_REDIRECT_URI}|g" "$file"
    fi
  done
fi

# Start the Node web server
if [ -f "/app/dist/index.html" ]; then
  sed -i "s|__VITE_API_URL__|${VITE_API_URL}|g" /app/dist/index.html
fi

echo "env setup done and run npm"
npm start