import { prisma } from './db';

/**
 * Aggregate poll results for a given poll ID.
 * Shared between the vote and results API routes.
 */
export async function getPollResults(pollId: string) {
    const votes = await prisma.pollVote.findMany({
        where: { pollId },
        select: { choice: true, neitherText: true },
    });

    const total = votes.length;
    const forCount = votes.filter((v) => v.choice === 'FOR').length;
    const againstCount = votes.filter((v) => v.choice === 'AGAINST').length;
    const neitherCount = votes.filter((v) => v.choice === 'NEITHER').length;
    const neitherResponses = votes
        .filter((v) => v.choice === 'NEITHER' && v.neitherText)
        .map((v) => v.neitherText);

    return {
        total,
        forCount,
        againstCount,
        neitherCount,
        forPercent: total > 0 ? Math.round((forCount / total) * 100) : 0,
        againstPercent: total > 0 ? Math.round((againstCount / total) * 100) : 0,
        neitherPercent: total > 0 ? Math.round((neitherCount / total) * 100) : 0,
        neitherResponses,
    };
}
