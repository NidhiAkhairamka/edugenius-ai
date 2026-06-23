/**
 * skillGraph.ts — single source of truth linking diagnostic skill nodes to
 * human-readable names and to topics in the 58-topic CURRICULUM bank.
 *
 * Used by the study-plan generator (gap node -> topic to study) and by the
 * diagnostic / skill map for consistent labelling. Previously these maps were
 * duplicated across three components.
 */

/** Friendly display name for every skill node used by the diagnostic bank. */
export const NODE_NAMES: Record<string, string> = {
  // Number
  'place-value-large': 'Place value',
  'multiplication-basic': 'Multiplication',
  'factors-multiples': 'Factors & multiples',
  'fractions-basic': 'Fractions',
  'fractions-add': 'Adding fractions',
  'decimals-basic': 'Decimals',
  'percentages-basic': 'Percentages',
  'percentages-change': 'Percentage change',
  'ratio-basic': 'Ratio & proportion',
  'prime-factorisation': 'Prime factorisation',
  'indices-basic': 'Indices',
  'indices-advanced': 'Advanced indices',
  'standard-form': 'Standard form',
  'surds': 'Surds',
  // Algebra
  'patterns-basic': 'Number patterns',
  'algebra-intro': 'Algebra intro',
  'equations-linear-basic': 'Linear equations',
  'sequences-linear': 'Sequences',
  'graphs-linear': 'Linear graphs',
  'algebra-expand': 'Expanding brackets',
  'algebra-factorise': 'Factorising',
  'equations-simultaneous': 'Simultaneous equations',
  'quadratics-factorise': 'Quadratics',
  // Geometry
  'angles-intro': 'Angles intro',
  'angles-triangles': 'Angles in triangles',
  'angles-parallel': 'Angles & parallel lines',
  'angles-polygons': 'Angles in polygons',
  'shapes-basic': 'Properties of shapes',
  'perimeter-basic': 'Perimeter',
  'area-basic': 'Area',
  'area-compound': 'Compound area',
  'area-triangle': 'Area — triangles',
  'area-circle': 'Circle area & circumference',
  'pythagoras': 'Pythagoras',
  'pythagoras-3d': 'Pythagoras in 3D',
  'trigonometry-basic': 'Trigonometry',
  'trigonometry-advanced': 'Advanced trigonometry',
  'circle-theorems': 'Circle theorems',
  'similarity': 'Similar shapes',
  'volume-basic': 'Volume',
  'volume-cylinder': 'Volume of cylinders',
  'volume-sphere': 'Volume of spheres',
  'vectors-basic': 'Vectors',
  'transformations': 'Transformations',
  // Statistics
  'data-basic': 'Data & charts',
  'mean-median-mode': 'Averages & range',
  'frequency-tables': 'Frequency tables',
  'probability-basic': 'Probability basics',
  'probability-combined': 'Combined probability',
  'probability-conditional': 'Conditional probability',
  'probability-tree': 'Tree diagrams',
};

export function nodeName(id: string): string {
  return NODE_NAMES[id] || id;
}

/**
 * Map each skill node to the best-fit topic id in the CURRICULUM bank
 * (see constants.ts). Used to turn a confirmed gap into a study session.
 */
export const NODE_TO_TOPIC: Record<string, string> = {
  // Number
  'place-value-large': 'm-y5-place-value',
  'multiplication-basic': 'm-y5-mult-div',
  'factors-multiples': 'm-y5-mult-div',
  'fractions-basic': 'm-y5-fractions',
  'fractions-add': 'm-y6-fractions',
  'decimals-basic': 'm-y5-fractions',
  'percentages-basic': 'm-y5-perc',
  'percentages-change': 'm-y5-perc',
  'ratio-basic': 'm-y8-ratio',
  'prime-factorisation': 'm-y5-mult-div',
  'indices-basic': 'm-y9-indices',
  'indices-advanced': 'm-y9-indices',
  'standard-form': 'm-y9-standard-form',
  'surds': 'm-y9-indices',
  // Algebra
  'patterns-basic': 'm-y7-sequences',
  'algebra-intro': 'm-y6-algebra-intro',
  'equations-linear-basic': 'm-y9-equations',
  'sequences-linear': 'm-y7-sequences',
  'graphs-linear': 'm-y8-linear-graphs',
  'algebra-expand': 'm-y6-algebra-intro',
  'algebra-factorise': 'm-y10-quadratics',
  'equations-simultaneous': 'm-y9-equations',
  'quadratics-factorise': 'm-y10-quadratics',
  // Geometry
  'angles-intro': 'm-y5-geometry',
  'angles-triangles': 'm-y6-geometry',
  'angles-parallel': 'm-y6-geometry',
  'angles-polygons': 'm-y6-geometry',
  'shapes-basic': 'm-y5-geometry',
  'perimeter-basic': 'm-y5-measure',
  'area-basic': 'm-y5-measure',
  'area-compound': 'm-y5-measure',
  'area-triangle': 'm-y6-measurement',
  'area-circle': 'm-y6-measurement',
  'pythagoras': 'm-y9-pythagoras',
  'pythagoras-3d': 'm-y9-pythagoras',
  'trigonometry-basic': 'm-y9-trig',
  'trigonometry-advanced': 'm-y9-trig',
  'circle-theorems': 'm-y10-circles',
  'similarity': 'm-y6-geometry',
  'volume-basic': 'm-y8-3d-geometry',
  'volume-cylinder': 'm-y8-3d-geometry',
  'volume-sphere': 'm-y8-3d-geometry',
  'vectors-basic': 'm-y10-vectors',
  'transformations': 'm-y5-pos-dir',
  // Statistics
  'data-basic': 'm-y5-stats',
  'mean-median-mode': 'm-y8-statistics',
  'frequency-tables': 'm-y8-statistics',
  'probability-basic': 'm-y7-prob-basics',
  'probability-combined': 'm-y9-prob',
  'probability-conditional': 'm-y9-prob',
  'probability-tree': 'm-y10-prob-trees',
};

export function topicForNode(id: string): string | null {
  return NODE_TO_TOPIC[id] || null;
}
