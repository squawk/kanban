import {
  type RouteConfig,
  index,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("verify-email", "routes/verify-email.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("about", "routes/about.tsx"),
  // Auth routes
  route("api/auth/register", "routes/api.auth.register.ts"),
  route("api/auth/login", "routes/api.auth.login.ts"),
  route("api/auth/logout", "routes/api.auth.logout.ts"),
  route("api/auth/me", "routes/api.auth.me.ts"),
  route("api/auth/verify-email", "routes/api.auth.verify-email.ts"),
  route("api/auth/forgot-password", "routes/api.auth.forgot-password.ts"),
  route("api/auth/reset-password", "routes/api.auth.reset-password.ts"),
  route("api/auth/approve", "routes/api.auth.approve.ts"),
  // Board routes
  route("api/generate-prompt", "routes/api.generate-prompt.ts"),
  route("api/board", "routes/api.board.ts"),
  route("api/cards", "routes/api.cards.ts"),
  route("api/cards/:cardId", "routes/api.cards.$cardId.ts"),
  route("api/cards/:cardId/comments", "routes/api.cards.$cardId.comments.ts"),
  route("api/columns", "routes/api.columns.ts"),
  route("api/columns/:columnId", "routes/api.columns.$columnId.ts"),
  route("api/tags", "routes/api.tags.ts"),
  route("api/templates", "routes/api.templates.ts"),
] satisfies RouteConfig;
