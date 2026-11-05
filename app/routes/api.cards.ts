import { api, requireUser } from "~/lib/access.server";
import { json, jsonError, readJson } from "~/lib/http";
import { createCard, type NewCardInput } from "~/lib/card-create.server";

// POST /api/cards - Create a new card
export const action = api("create card", async ({ request }: { request: Request }) => {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);

  const user = await requireUser(request);
  const input = await readJson<NewCardInput>(request);
  const { card } = await createCard(user, input, request);
  return json(card, 201);
});
