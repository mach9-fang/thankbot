import { NextResponse } from "next/server";
import { getThanksForPublicCard } from "@/lib/db";
import { emojifyText } from "@/lib/emoji";
import { renderThanksCardGifForId } from "@/lib/thanks-card-gif";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 1-second thank-you card GIF with confetti. Public so Slack can embed it on
 * the in-channel `/thanks` confirmation without a Google session.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const thanks = await getThanksForPublicCard(params.id);
    if (!thanks) {
      return new NextResponse("Thanks not found", { status: 404 });
    }

    const gif = await renderThanksCardGifForId(thanks.id, {
      fromName: thanks.from_person.name,
      toNames: thanks.to_people.map((person) => person.name),
      reason: emojifyText(thanks.reason),
    });

    return new NextResponse(Buffer.from(gif), {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not render the card.";
    return new NextResponse(message, { status: 500 });
  }
}
