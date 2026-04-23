
import { Subject, Topic, StudentProfile, AgentSkin } from './types';

export const CURRICULUM: Topic[] = [
  // YEAR 5 MATHS
  { id: 'm-y5-place-value', year: 5, name: 'Place Value Mastery', subject: Subject.MATHS, description: 'Numbers up to 1,000,000, rounding, and negative numbers.' },
  { id: 'm-y5-add-sub', year: 5, name: 'Addition & Subtraction', subject: Subject.MATHS, description: 'Formal written methods for large numbers and mental strategies.' },
  { id: 'm-y5-mult-div', year: 5, name: 'Multiplication & Division', subject: Subject.MATHS, description: 'Factors, primes, square/cube numbers, and multi-digit multiplication.' },
  { id: 'm-y5-fractions', year: 5, name: 'Fractions & Decimals', subject: Subject.MATHS, description: 'Comparing, ordering, and adding fractions with different denominators.' },
  { id: 'm-y5-perc', year: 5, name: 'Percentages', subject: Subject.MATHS, description: 'Understanding percentages as a fraction of 100.' },
  { id: 'm-y5-measure', year: 5, name: 'Measurement & Area', subject: Subject.MATHS, description: 'Converting units and calculating area/perimeter of composite shapes.' },
  { id: 'm-y5-geometry', year: 5, name: 'Properties of Shapes', subject: Subject.MATHS, description: 'Identifying 3D shapes, measuring angles, and degrees.' },
  { id: 'm-y5-pos-dir', year: 5, name: 'Position & Direction', subject: Subject.MATHS, description: 'Reflection and translation of shapes on a coordinate grid.' },
  { id: 'm-y5-stats', year: 5, name: 'Statistics & Graphs', subject: Subject.MATHS, description: 'Solving comparison and sum problems using line graphs and tables.' },

  // YEAR 5 SCIENCE
  { id: 's-y5-life-cycles', year: 5, name: 'Life Cycles', subject: Subject.SCIENCE, description: 'Comparing life cycles of mammals, amphibians, insects, and birds.' },
  { id: 's-y5-humans', year: 5, name: 'Human Development', subject: Subject.SCIENCE, description: 'Describing the changes as humans develop to old age.' },
  { id: 's-y5-materials-prop', year: 5, name: 'Properties of Materials', subject: Subject.SCIENCE, description: 'Hardness, solubility, conductivity, and response to magnets.' },
  { id: 's-y5-materials-change', year: 5, name: 'Material Changes', subject: Subject.SCIENCE, description: 'Dissolving, mixing, and reversible vs irreversible changes.' },
  { id: 's-y5-earth-space', year: 5, name: 'Earth & Space', subject: Subject.SCIENCE, description: 'Movement of the Earth and other planets relative to the Sun.' },
  { id: 's-y5-forces', year: 5, name: 'Forces & Gravity', subject: Subject.SCIENCE, description: 'Exploring gravity, air resistance, water resistance, and friction.' },

  // YEAR 6 MATHS
  { id: 'm-y6-fractions', year: 6, name: 'Fractions & Decimals', subject: Subject.MATHS, description: 'Mastering equivalence, addition, and subtraction of fractions and decimals.' },
  { id: 'm-y6-algebra-intro', year: 6, name: 'Introductory Algebra', subject: Subject.MATHS, description: 'Using simple formulae and expressing missing number problems algebraically.' },
  { id: 'm-y6-geometry', year: 6, name: 'Angles & Shapes', subject: Subject.MATHS, description: 'Calculating angles in triangles, quadrilaterals, and regular polygons.' },
  { id: 'm-y6-measurement', year: 6, name: 'Area & Perimeter', subject: Subject.MATHS, description: 'Calculating the area of parallelograms and triangles; volume of cubes.' },

  // YEAR 6 SCIENCE
  { id: 's-y6-electricity', year: 6, name: 'Electricity & Circuits', subject: Subject.SCIENCE, description: 'Understanding brightness of lamps and volume of buzzers in series circuits.' },
  { id: 's-y6-light', year: 6, name: 'Light & Shadows', subject: Subject.SCIENCE, description: 'How light travels in straight lines and how we see objects through reflection.' },
  { id: 's-y6-living-things', year: 6, name: 'Living Things', subject: Subject.SCIENCE, description: 'Classification of animals and plants based on specific characteristics.' },
  { id: 's-y6-evolution', year: 6, name: 'Evolution & Inheritance', subject: Subject.SCIENCE, description: 'Recognising that living things change over time and offspring vary from parents.' },

  // YEAR 7 MATHS
  { id: 'm-y7-directed-numbers', year: 7, name: 'Directed Numbers', subject: Subject.MATHS, description: 'Operations with negative numbers in contexts like temperature and debt.' },
  { id: 'm-y7-sequences', year: 7, name: 'Algebraic Sequences', subject: Subject.MATHS, description: 'Finding the nth term and describing patterns in number sequences.' },
  { id: 'm-y7-fractions-calc', year: 7, name: 'Fractional Thinking', subject: Subject.MATHS, description: 'Multiplying and dividing fractions and working with mixed numbers.' },
  { id: 'm-y7-prob-basics', year: 7, name: 'Probability Basics', subject: Subject.MATHS, description: 'Using the 0-1 probability scale and calculating simple theoretical probabilities.' },

  // YEAR 7 SCIENCE
  { id: 's-y7-cells', year: 7, name: 'Cells & Microscopes', subject: Subject.SCIENCE, description: 'Structure of plant and animal cells and how to use a light microscope.' },
  { id: 's-y7-particles', year: 7, name: 'Particles & Atoms', subject: Subject.SCIENCE, description: 'The particle model of solids, liquids, and gases; basic atomic structure.' },
  { id: 's-y7-forces', year: 7, name: 'Forces & Motion', subject: Subject.SCIENCE, description: 'Balanced and unbalanced forces, friction, and calculating speed.' },
  { id: 's-y7-sound', year: 7, name: 'Sound & Hearing', subject: Subject.SCIENCE, description: 'How sound waves travel through mediums and how the human ear works.' },

  // YEAR 8 MATHS
  { id: 'm-y8-ratio', year: 8, name: 'Ratio & Proportion', subject: Subject.MATHS, description: 'Sharing amounts in a ratio and solving direct proportion problems.' },
  { id: 'm-y8-linear-graphs', year: 8, name: 'Linear Graphs', subject: Subject.MATHS, description: 'Plotting y = mx + c and understanding gradients and intercepts.' },
  { id: 'm-y8-statistics', year: 8, name: 'Statistical Diagrams', subject: Subject.MATHS, description: 'Interpreting pie charts, frequency tables, and grouped data.' },
  { id: 'm-y8-3d-geometry', year: 8, name: '3D Geometry', subject: Subject.MATHS, description: 'Surface area and volume of prisms, cylinders, and complex shapes.' },

  // YEAR 8 SCIENCE
  { id: 's-y8-nutrition', year: 8, name: 'Nutrition & Digestion', subject: Subject.SCIENCE, description: 'The components of a healthy diet and the stages of the digestive system.' },
  { id: 's-y8-periodic-table', year: 8, name: 'The Periodic Table', subject: Subject.SCIENCE, description: 'Trends in Group 1, Group 7, and the history of Mendeleev’s table.' },
  { id: 's-y8-energy-transfers', year: 8, name: 'Energy Transfers', subject: Subject.SCIENCE, description: 'Conduction, convection, radiation, and efficiency of energy use.' },
  { id: 's-y8-space', year: 8, name: 'Space Physics', subject: Subject.SCIENCE, description: 'Our solar system, gravity, orbits, and the lifecycle of stars.' },

  // YEAR 9 MATHS
  { id: 'm-y9-pythagoras', year: 9, name: 'Pythagoras’ Theorem', subject: Subject.MATHS, description: 'Using a² + b² = c² to find missing sides in right-angled triangles.' },
  { id: 'm-y9-trig', year: 9, name: 'Trigonometry', subject: Subject.MATHS, description: 'Understanding SOH CAH TOA to find missing angles and sides in right triangles.' },
  { id: 'm-y9-equations', year: 9, name: 'Linear Equations', subject: Subject.MATHS, description: 'Solving multi-step equations and working with brackets.' },
  { id: 'm-y9-standard-form', year: 9, name: 'Standard Form', subject: Subject.MATHS, description: 'Writing very large and very small numbers using powers of 10.' },
  { id: 'm-y9-prob', year: 9, name: 'Advanced Probability', subject: Subject.MATHS, description: 'Using tree diagrams and calculating probability of independent events.' },
  { id: 'm-y9-indices', year: 9, name: 'Laws of Indices', subject: Subject.MATHS, description: 'Understanding rules for multiplying, dividing, and raising powers.' },

  // YEAR 9 SCIENCE
  { id: 's-y9-atoms', year: 9, name: 'Atomic Structure', subject: Subject.SCIENCE, description: 'Protons, neutrons, electrons, and the history of the atomic model.' },
  { id: 's-y9-energy', year: 9, name: 'Energy & Efficiency', subject: Subject.SCIENCE, description: 'Calculating work done, GPE, kinetic energy, and conservation.' },
  { id: 's-y9-cells', year: 9, name: 'Cell Biology', subject: Subject.SCIENCE, description: 'Comparing plant and animal cells, microscopes, and diffusion.' },
  { id: 's-y9-bonding', year: 9, name: 'Chemical Bonding', subject: Subject.SCIENCE, description: 'Introduction to ionic, covalent, and metallic bonding structures.' },
  { id: 's-y9-periodic', year: 9, name: 'The Periodic Table', subject: Subject.SCIENCE, description: 'Trends in Group 1, Group 7, and transition metal properties.' },

  // YEAR 10 MATHS
  { id: 'm-y10-quadratics', year: 10, name: 'Quadratic Equations', subject: Subject.MATHS, description: 'Factorising, using the quadratic formula, and completing the square.' },
  { id: 'm-y10-prob-trees', year: 10, name: 'Probability Trees', subject: Subject.MATHS, description: 'Modeling independent and dependent events with probability trees.' },
  { id: 'm-y10-circles', year: 10, name: 'Circle Theorems', subject: Subject.MATHS, description: 'The 8 geometric rules governing angles and lines within circles.' },
  { id: 'm-y10-vectors', year: 10, name: 'Vector Geometry', subject: Subject.MATHS, description: 'Adding, subtracting, and scaling vectors to solve geometric proofs.' },

  // YEAR 10 SCIENCE
  { id: 's-y10-infection', year: 10, name: 'Infection & Response', subject: Subject.SCIENCE, description: 'Communicable diseases, pathogens, vaccines, and the immune system.' },
  { id: 's-y10-organic-chem', year: 10, name: 'Organic Chemistry', subject: Subject.SCIENCE, description: 'Alkanes, alkenes, crude oil fractional distillation, and cracking.' },
  { id: 's-y10-waves', year: 10, name: 'Waves & Radiation', subject: Subject.SCIENCE, description: 'Properties of transverse and longitudinal waves; the EM spectrum.' },
  { id: 's-y10-magnetism', year: 10, name: 'Magnetism', subject: Subject.SCIENCE, description: 'Electromagnets, the motor effect, and Fleming’s left-hand rule.' },

  
];

export const RANKS = [
  { minXP: 0, title: 'Novice Apprentice' },
  { minXP: 1000, title: 'Junior Scholar' },
  { minXP: 5000, title: 'Master Researcher' },
  { minXP: 15000, title: 'Senior Alchemist' },
  { minXP: 30000, title: 'EduGenius Visionary' },
  { minXP: 60000, title: 'Grandmaster Tutor' },
];

export const AGENT_SKINS: AgentSkin[] = [
  { id: 'skin-og', name: 'Classic Socrates', cost: 0, unlocked: true, description: 'The original mentor.', icon: '👨‍🏫' },
  { id: 'skin-space', name: 'Astronaut Socrates', cost: 1500, unlocked: false, description: 'Cosmic wisdom and star-studded tips.', icon: '👨‍🚀' },
  { id: 'skin-robot', name: 'Cyber-Master', cost: 3000, unlocked: false, description: 'Futuristic AI with high-speed feedback.', icon: '🤖' },
  { id: 'skin-wizard', name: 'The Knowledge Wizard', cost: 5000, unlocked: false, description: 'Magical explanations for tricky topics.', icon: '🧙‍♂️' },
];

export const INITIAL_STUDENT: StudentProfile = {
  name: '',
  email: '',
  dob: '',
  yearLevel: 9,
  experience: 0,
  totalPoints: 0,
  gems: 100,
  rank: 'Novice Apprentice',
  streak: 1,
  lastActive: new Date().toDateString(),
  badges: [],
  unlockedSkins: ['skin-og'],
  activeSkinId: 'skin-og',
  dailyMissions: [
    { id: 'm1', text: 'Answer 5 questions correctly', completed: false, reward: 200 },
    { id: 'm2', text: 'Achieve Mastery in one topic', completed: false, reward: 500 }
  ],
  vault: [],
  activeStudyPacks: [],
  externalAnalyses: [],
  masteryData: {}
};

export const DUMMY_STUDENT: StudentProfile = {
  ...INITIAL_STUDENT,
  name: 'DemoGenius',
  experience: 1200,
  totalPoints: 2500,
  gems: 850,
  rank: 'Junior Scholar'
};
