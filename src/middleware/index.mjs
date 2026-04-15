/**
 * Load all middleware modules.
 * Import this file to register all built-in middleware with the pipeline.
 *
 * Order matters: provider-compat runs first (fix roles),
 * then enrichment (prompt, memory, skills), then analysis,
 * then compression, then logging.
 */

import './provider-compat.mjs';
import './scope-resolver.mjs';
import './prompt-assembler.mjs';
import './memory-loop.mjs';
import './skill-router.mjs';
import './task-analyzer.mjs';
import './risk-gate.mjs';
import './context-compressor.mjs';
import './trace-logger.mjs';
