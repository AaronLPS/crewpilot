import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { teamConfigExists } from '../scaffold.js'

/**
 * Search result interface - now grouped by file
 */
interface SearchResult {
  file: string
  score: number
  matches: Match[]
}

interface Match {
  line: number
  context: string
  score: number
}

/**
 * Memory index structure
 */
interface MemoryIndex {
  lastUpdated: string
  entries: Array<{
    file: string
    keywords: string[]
    lineCount: number
  }>
}

interface SearchOptions {
  cwd?: string
  limit?: number
  rebuildIndex?: boolean
  caseSensitive?: boolean
  fuzzy?: boolean
}

const INDEX_FILE = 'memory-index.json'
const MAX_FILE_SIZE_MB = 10 // Skip files larger than 10MB
const CONTEXT_LINES = 2 // Lines before and after match

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[b.length][a.length]
}

/**
 * Check if two strings are similar (for fuzzy matching)
 */
function isFuzzyMatch(str: string, query: string, maxDistance = 2): boolean {
  if (query.length <= 3) {
    return str === query || levenshteinDistance(str, query) <= 1
  }
  return levenshteinDistance(str, query) <= maxDistance
}

/**
 * Get all searchable files in .team-config/
 */
function getSearchableFiles(cwd: string): string[] {
  const configDir = path.join(cwd, '.team-config')
  const files: string[] = []

  // Check if config directory exists
  if (!fs.existsSync(configDir)) {
    return files
  }

  // Core memory files
  const coreFiles = [
    'target-user-profile.md',
    'USER-CONTEXT.md',
    'project-context.md',
    'communication-log.md',
    'human-inbox.md',
    'state-snapshot.md',
    'session-recovery.md',
    'team-lead-persona.md',
    'human-directives.md',
    'needs-human-decision.md',
  ]

  for (const file of coreFiles) {
    const filePath = path.join(configDir, file)
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath)
      if (stats.isFile() && stats.size <= MAX_FILE_SIZE_MB * 1024 * 1024) {
        files.push(filePath)
      }
    }
  }

  // User research directory
  const researchDir = path.join(configDir, 'user-research')
  if (fs.existsSync(researchDir)) {
    try {
      const researchFiles = fs.readdirSync(researchDir)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(researchDir, f))
        .filter(f => {
          const stats = fs.statSync(f)
          return stats.isFile() && stats.size <= MAX_FILE_SIZE_MB * 1024 * 1024
        })
      files.push(...researchFiles)
    } catch (err) {
      // Ignore errors reading directory
    }
  }

  // Evaluations directory
  const evalDir = path.join(configDir, 'evaluations')
  if (fs.existsSync(evalDir)) {
    try {
      const evalFiles = fs.readdirSync(evalDir)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(evalDir, f))
        .filter(f => {
          const stats = fs.statSync(f)
          return stats.isFile() && stats.size <= MAX_FILE_SIZE_MB * 1024 * 1024
        })
      files.push(...evalFiles)
    } catch (err) {
      // Ignore errors reading directory
    }
  }

  return files
}

/**
 * Calculate relevance score for a line
 */
function calculateScore(
  line: string,
  query: string,
  queryWords: string[],
  options: { caseSensitive: boolean; fuzzy: boolean }
): number {
  const lineToSearch = options.caseSensitive ? line : line.toLowerCase()
  const queryToMatch = options.caseSensitive ? query : query.toLowerCase()
  let score = 0

  // Exact match gets highest score
  if (lineToSearch.includes(queryToMatch)) {
    score += 20
    // Bonus for exact match at word boundary
    const wordBoundaryRegex = new RegExp(
      `\\b${escapeRegex(queryToMatch)}\\b`,
      options.caseSensitive ? 'g' : 'gi'
    )
    if (wordBoundaryRegex.test(lineToSearch)) {
      score += 10
    }
    // Bonus for exact match at start of line
    if (lineToSearch.trimStart().startsWith(queryToMatch)) {
      score += 5
    }
  }
  
  // Fuzzy match
  if (options.fuzzy) {
    const words = lineToSearch.split(/\s+/)
    for (const word of words) {
      if (word.length > 3 && isFuzzyMatch(word, queryToMatch)) {
        score += 3
      }
    }
  }
  
  // Individual word matches with proximity bonus
  let matchedWords = 0
  for (const word of queryWords) {
    if (word.length < 2) continue
    
    if (lineToSearch.includes(word)) {
      score += 3
      matchedWords++
      // Bonus for word boundary match
      const wordBoundaryRegex = new RegExp(
        `\\b${escapeRegex(word)}\\b`,
        options.caseSensitive ? 'g' : 'gi'
      )
      if (wordBoundaryRegex.test(lineToSearch)) {
        score += 2
      }
    } else if (options.fuzzy && word.length > 3) {
      const words = lineToSearch.split(/\s+/)
      if (words.some(w => isFuzzyMatch(w, word, 1))) {
        score += 1
        matchedWords++
      }
    }
  }
  
  // Proximity bonus: all query words found in same line
  if (matchedWords === queryWords.length && queryWords.length > 1) {
    score += 5
  }

  return score
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Search content with enhanced relevance scoring
 */
function searchInFile(
  filePath: string,
  query: string,
  options: { caseSensitive: boolean; fuzzy: boolean }
): SearchResult | null {
  try {
    const stats = fs.statSync(filePath)
    if (!stats.isFile() || stats.size === 0) {
      return null
    }
    
    // Skip binary files
    const buffer = fs.readFileSync(filePath)
    if (isBinaryFile(buffer)) {
      return null
    }
    
    const content = buffer.toString('utf-8')
    const lines = content.split('\n')
    const queryLower = query.toLowerCase()
    const queryWords = (options.caseSensitive ? query : queryLower).split(/\s+/).filter(w => w.length >= 2)

    if (queryWords.length === 0) {
      return null
    }

    const matches: Match[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const score = calculateScore(line, query, queryWords, options)

      if (score > 0) {
        // Get context (lines before and after)
        const start = Math.max(0, i - CONTEXT_LINES)
        const end = Math.min(lines.length, i + CONTEXT_LINES + 1)
        const context = lines.slice(start, end).join('\n')
        
        matches.push({
          line: i + 1,
          context,
          score,
        })
      }
    }

    if (matches.length === 0) {
      return null
    }

    // Sort matches by score (descending) then by line number
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.line - b.line
    })

    // Deduplicate nearby matches (keep highest scoring from each cluster)
    const deduplicatedMatches: Match[] = []
    let lastLine = -5
    for (const match of matches) {
      if (match.line - lastLine > CONTEXT_LINES * 2) {
        deduplicatedMatches.push(match)
        lastLine = match.line
      }
    }

    // Calculate file-level score (sum of top 3 matches)
    const fileScore = deduplicatedMatches
      .slice(0, 3)
      .reduce((sum, m) => sum + m.score, 0)

    return {
      file: filePath,
      score: fileScore,
      matches: deduplicatedMatches.slice(0, 5), // Limit matches per file
    }
  } catch (err) {
    // Log file-specific errors for debugging
    if (process.env.CREWPILOT_DEBUG) {
      console.error(chalk.gray(`Debug: Could not search ${filePath}: ${err}`))
    }
    return null
  }
}

/**
 * Check if buffer appears to be binary
 */
function isBinaryFile(buffer: Buffer): boolean {
  // Check for null bytes which indicate binary content
  for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
    if (buffer[i] === 0) {
      return true
    }
  }
  return false
}

/**
 * Format search result for display
 */
function formatResult(result: SearchResult, cwd: string, query: string, options: { caseSensitive: boolean }): string {
  const relativePath = path.relative(cwd, result.file)
  
  let output = chalk.cyan(`\n${relativePath}`) + chalk.gray(` (score: ${result.score}, ${result.matches.length} match${result.matches.length !== 1 ? 'es' : ''})\n`)
  
  for (const match of result.matches) {
    const lines = match.context.split('\n')
    const startLine = match.line - Math.min(CONTEXT_LINES, match.line - 1)
    
    for (let i = 0; i < lines.length; i++) {
      const lineNum = startLine + i
      const line = lines[i]
      const isMatchLine = lineNum === match.line
      
      const prefix = isMatchLine ? chalk.green('>') : chalk.gray(' ')
      const num = chalk.gray(String(lineNum).padStart(4))
      
      // Highlight matching terms
      let content: string
      if (isMatchLine) {
        content = highlightTerms(line, query, options.caseSensitive)
      } else {
        content = chalk.gray(line)
      }
      
      output += `${prefix} ${num} │ ${content}\n`
    }
    
    if (result.matches.length > 1) {
      output += chalk.gray('  ...\n')
    }
  }
  
  return output
}

/**
 * Highlight matching terms in a line
 */
function highlightTerms(line: string, query: string, caseSensitive: boolean): string {
  const queryWords = query.split(/\s+/).filter(w => w.length >= 2)
  if (queryWords.length === 0) return chalk.white(line)
  
  // Sort words by length (descending) to match longer terms first
  const sortedWords = [...queryWords].sort((a, b) => b.length - a.length)
  
  let result = line
  const regexFlags = caseSensitive ? 'g' : 'gi'
  
  for (const word of sortedWords) {
    const escaped = escapeRegex(word)
    const regex = new RegExp(`(${escaped})`, regexFlags)
    result = result.replace(regex, chalk.yellow('$1'))
  }
  
  return chalk.white(result)
}

/**
 * Build a simple keyword index for faster searches
 */
export function buildIndex(cwd: string): void {
  const configDir = path.join(cwd, '.team-config')
  const indexPath = path.join(configDir, INDEX_FILE)

  const files = getSearchableFiles(cwd)
  const entries: MemoryIndex['entries'] = []

  for (const file of files) {
    try {
      const stats = fs.statSync(file)
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      
      // Extract keywords (improved: include single-occurrence important words)
      const wordFreq = new Map<string, number>()
      const words = content.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3)
      
      for (const word of words) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
      }
      
      // Top keywords + important single-occurrence words (longer words are more distinctive)
      const allWords = Array.from(wordFreq.entries())
      const multiOccurrence = allWords
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word]) => word)
      
      const distinctiveWords = allWords
        .filter(([, count]) => count === 1)
        .filter(([word]) => word.length > 6)
        .slice(0, 5)
        .map(([word]) => word)
      
      const keywords = [...new Set([...multiOccurrence, ...distinctiveWords])]

      entries.push({
        file: path.relative(configDir, file),
        keywords,
        lineCount: lines.length,
        size: stats.size,
      } as any)
    } catch (err) {
      if (process.env.CREWPILOT_DEBUG) {
        console.error(chalk.gray(`Debug: Could not index ${file}: ${err}`))
      }
    }
  }

  const index: MemoryIndex = {
    lastUpdated: new Date().toISOString(),
    entries,
  }

  try {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2))
  } catch (err) {
    throw new Error(`Failed to write search index: ${err}`)
  }
}

/**
 * Validate and normalize search query
 */
function validateQuery(query: string): { valid: boolean; error?: string; normalized?: string } {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Query must be a non-empty string.' }
  }
  
  const trimmed = query.trim()
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Query cannot be empty.' }
  }
  
  if (trimmed.length < 2) {
    return { valid: false, error: 'Please provide a search query (at least 2 characters).' }
  }
  
  if (trimmed.length > 200) {
    return { valid: false, error: 'Query is too long (maximum 200 characters).' }
  }
  
  // Check for potentially problematic characters
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmed)) {
    return { valid: false, error: 'Query contains invalid characters.' }
  }
  
  return { valid: true, normalized: trimmed }
}

/**
 * Run search across all memory files
 */
export function runSearch(query: string, options: SearchOptions = {}): void {
  const cwd = options.cwd ?? process.cwd()
  const limit = options.limit ?? 20
  const caseSensitive = options.caseSensitive ?? false
  const fuzzy = options.fuzzy ?? false

  // Validate team config exists
  if (!teamConfigExists(cwd)) {
    console.log(chalk.red(`✗ No .team-config/ found`))
    console.log(chalk.gray('Run crewpilot init to set up your project first.'))
    return
  }

  // Validate query
  const validation = validateQuery(query)
  if (!validation.valid) {
    console.log(chalk.yellow(validation.error))
    console.log(chalk.gray('Usage: crewpilot search "authentication patterns"'))
    return
  }
  
  const normalizedQuery = validation.normalized!

  // Optionally rebuild index
  if (options.rebuildIndex) {
    console.log(chalk.blue('Rebuilding memory index...'))
    try {
      buildIndex(cwd)
      console.log(chalk.green('✓ Index rebuilt'))
    } catch (err) {
      console.log(chalk.yellow(`⚠ Could not rebuild index: ${err}`))
      console.log(chalk.gray('Continuing with search anyway...'))
    }
  }

  console.log(chalk.blue(`\nSearching for: "${normalizedQuery}"`))
  if (fuzzy) {
    console.log(chalk.gray('(fuzzy matching enabled)'))
  }
  console.log(chalk.gray('─'.repeat(50)))

  const files = getSearchableFiles(cwd)
  
  if (files.length === 0) {
    console.log(chalk.yellow('\n⚠ No memory files found to search.'))
    console.log(chalk.gray('Your .team-config/ directory may be empty.'))
    return
  }

  // Filter out files that are in index if query matches index keywords
  // This is a quick pre-filtering optimization
  let filesToSearch = files
  try {
    const indexPath = path.join(cwd, '.team-config', INDEX_FILE)
    if (fs.existsSync(indexPath) && !options.rebuildIndex) {
      const index: MemoryIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
      const queryWords = normalizedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      
      // Quick filter: only search files that have matching keywords in index
      if (queryWords.length > 0 && !fuzzy) {
        const matchingFiles = new Set(
          index.entries
            .filter(entry => 
              queryWords.some(qw => 
                entry.keywords.some(kw => kw.includes(qw) || qw.includes(kw))
              )
            )
            .map(entry => path.join(cwd, '.team-config', entry.file))
        )
        
        // If we found matches in index, prioritize those files
        if (matchingFiles.size > 0) {
          const prioritized = files.filter(f => matchingFiles.has(f))
          const others = files.filter(f => !matchingFiles.has(f))
          filesToSearch = [...prioritized, ...others]
        }
      }
    }
  } catch {
    // If index reading fails, search all files
  }

  const results: SearchResult[] = []

  for (const file of filesToSearch) {
    const result = searchInFile(file, normalizedQuery, { caseSensitive, fuzzy })
    if (result) {
      results.push(result)
    }
  }

  // Sort by file score (descending)
  results.sort((a, b) => b.score - a.score)

  // Apply limit at file level
  const limitedResults = results.slice(0, limit)

  if (limitedResults.length === 0) {
    console.log(chalk.yellow('\n✗ No results found.'))
    console.log(chalk.gray('\nSuggestions:'))
    console.log(chalk.gray('  • Try different keywords or synonyms'))
    console.log(chalk.gray('  • Use shorter, more general terms'))
    console.log(chalk.gray('  • Enable fuzzy matching: crewpilot search "term" --fuzzy'))
    console.log(chalk.gray('  • Check what files exist: crewpilot status'))
    return
  }

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0)
  console.log(chalk.green(`\n✓ Found ${results.length} file${results.length !== 1 ? 's' : ''} with ${totalMatches} match${totalMatches !== 1 ? 'es' : ''}`))
  
  if (results.length > limit) {
    console.log(chalk.gray(`(showing top ${limit} files)`))
  }

  for (const result of limitedResults) {
    console.log(formatResult(result, cwd, normalizedQuery, { caseSensitive }))
  }

  // Suggestions based on results
  if (results.length < 3 && !options.fuzzy && normalizedQuery.length > 4) {
    console.log(chalk.gray('\n💡 Tip: Try --fuzzy flag for approximate matching'))
  }
  if (results.length > 10 && !options.rebuildIndex) {
    console.log(chalk.gray('💡 Tip: Use --rebuild-index for faster searches'))
  }
}
