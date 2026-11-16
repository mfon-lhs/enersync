# Enersync web app image, in two stages.
# Stage 1 builds the app with Node. Stage 2 keeps only the finished files and serves them with nginx,
# so the final image has no Node, no node_modules and no source code.

FROM node:24-alpine AS build
WORKDIR /app

# Install the libraries first, so Docker can reuse this step until package.json changes
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

# The address the BROWSER uses to reach the API. It is written into the app when it is built.
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
