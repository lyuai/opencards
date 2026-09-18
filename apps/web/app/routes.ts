import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("./home.tsx"),
  route("training", "./training.tsx"),
] satisfies RouteConfig;
