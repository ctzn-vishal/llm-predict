import type { MarketRow } from "./schemas";

// Common English stopwords to exclude from comparison
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "and", "but", "or", "nor", "not", "so", "yet", "both",
  "either", "neither", "each", "every", "all", "any", "few", "more",
  "most", "other", "some", "such", "no", "only", "own", "same", "than",
  "too", "very", "just", "because", "if", "when", "where", "how",
  "what", "which", "who", "whom", "this", "that", "these", "those",
  "it", "its", "he", "she", "they", "them", "their", "we", "you",
  "i", "me", "my", "your", "his", "her", "our"
]);

/**
 * Tokenize a question string: lowercase, split on non-alpha, remove stopwords.
 */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Compute Jaccard similarity between two sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Detect correlated markets using Jaccard similarity on question text.
 * Returns a Map of marketId -> clusterId.
 * Markets with >50% word overlap are assigned to the same cluster.
 */
export function detectCorrelation(
  markets: MarketRow[],
  threshold = 0.5,
): Map<string, string> {
  const tokenSets = markets.map(m => ({
    id: m.id,
    tokens: tokenize(m.question),
  }));

  // Union-Find for clustering
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // Path compression
    let current = x;
    while (current !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  }

  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  }

  // Compare all pairs
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const sim = jaccardSimilarity(tokenSets[i].tokens, tokenSets[j].tokens);
      if (sim >= threshold) {
        union(tokenSets[i].id, tokenSets[j].id);
      }
    }
  }

  // Build result map: marketId -> clusterId
  const result = new Map<string, string>();
  for (const { id } of tokenSets) {
    const root = find(id);
    result.set(id, `cluster_${root}`);
  }

  return result;
}
