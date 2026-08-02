# Project Memory

## Configuration
- Use Docker Hub namespace `efekurucay` in this project's deployment examples and default image references.
- Deployment docs for end users should assume the image is already published; do not ask users to build or publish images unless the section is explicitly maintainer-only.

## Architecture
- Do not duplicate existing global sidebar note navigation inside feature pages — reuse the canonical sidebar as the note source for interactions like drag-and-drop.
- When removing a platform implementation, preserve reusable branding and mobile assets unless their deletion is explicitly requested.
