'use client';

import { HeroSection } from '@/components/landing/HeroSection';
import { ProblemSolution } from '@/components/landing/ProblemSolution';
import { FeaturesGrid } from '@/components/landing/FeaturesGrid';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { PodcastSection } from '@/components/landing/PodcastSection';
import { TechStack } from '@/components/landing/TechStack';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <ProblemSolution />
      <FeaturesGrid />
      <HowItWorks />
      <PodcastSection />
      <TechStack />
      <Footer />
    </main>
  );
}
