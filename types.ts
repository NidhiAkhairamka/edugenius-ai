
export const Subject = {
  MATHS: 'Maths',
  SCIENCE: 'Science'
} as const;

export type Subject = typeof Subject[keyof typeof Subject];

export const Difficulty = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced'
} as const;

export type Difficulty = typeof Difficulty[keyof typeof Difficulty];

export interface Topic {
  id: string;
  name: string;
  subject: Subject;
  description: string;
  year: number;
}

export interface Question {
  id: string;
  text: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: Difficulty;
  topic: string;
  subject: Subject;
  hint?: string;
  isExamStyle?: boolean;
  diagramStrategy?: 'none' | 'text-described' | 'data-table' | 'describe-instead' | 'topic-substitution';
}

export interface AssessmentResult {
  isCorrect: boolean;
  score: number;
  feedback: string;
  affirmation: string;
  correctiveHint?: string;
  newDifficulty: string;
  analysis: string;
}

export interface PaperAnalysis {
  topics: string[];
  difficulty: string;
  summary: string;
  subject: Subject;
  proceduralDNA?: string; 
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface StudyPack {
  playbook: string;
  logicSteps: string[];
  proceduralDNA: string;
  flashcards: Flashcard[];
  commonMistakes: string[];
  keyFormulas: string[];
}

export interface ScannedWorksheet {
  id: string;
  date: string;
  image: string; // Base64
  analysis: PaperAnalysis;
  subject: Subject;
  studyPack?: StudyPack;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
}

export interface AgentSkin {
  id: string;
  name: string;
  cost: number;
  unlocked: boolean;
  description: string;
  icon: string;
}

export interface DailyMission {
  id: string;
  text: string;
  completed: boolean;
  reward: number;
}

export interface StudentProfile {
  name: string;
  email: string;
  dob: string;
  yearLevel: number;
  experience: number;
  totalPoints: number;
  gems: number;
  rank: string;
  streak: number;
  lastActive: string;
  badges: Badge[];
  unlockedSkins: string[];
  activeSkinId: string;
  dailyMissions: DailyMission[];
  lastScannedAnalysis?: string;
  activeStudyPacks: StudyPack[]; // Replaces lastScannedStudyPack for multi-grounding
  vault: ScannedWorksheet[]; 
  externalAnalyses: {
    date: string;
    type: string;
    summary: string;
  }[];
  masteryData: {
    [topicId: string]: {
      score: number;
      attempts: number;
      status: 'locked' | 'in-progress' | 'completed' | 'testing';
      history: boolean[];
    };
  };
}

export type ViewState = 'login' | 'dashboard' | 'learning' | 'scanning' | 'statistics' | 'shop'| 'guide';
