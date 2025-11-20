import {
  type RouteConfig,
  index,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  route("api/generate-prompt", "routes/api.generate-prompt.ts"),
  route("api/board", "routes/api.board.ts"),
  route("api/cards", "routes/api.cards.ts"),
  route("api/cards/:cardId", "routes/api.cards.$cardId.ts"),
  route("api/columns", "routes/api.columns.ts"),
  route("api/columns/:columnId", "routes/api.columns.$columnId.ts"),
] satisfies RouteConfig;
