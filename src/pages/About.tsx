import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Zap, Globe, Shield, Heart, TrendingUp, MessageCircle, Rocket } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const About = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Header />
      <div className="container max-w-4xl mx-auto py-12 px-4">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
            About Splikz
          </h1>
          <p className="text-xl text-muted-foreground">
            Short. Sweet. Viral.
          </p>
        </div>

        {/* What is Splikz */}
        <Card className="mb-8">
          <CardContent className="p-8">
            <h2 className="text-2xl font-semibold mb-4 flex items-center">
              <Sparkles className="h-6 w-6 mr-2 text-primary" />
              What is Splikz?
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Splikz is the next-generation social platform built around short, sweet, 2–3 second looping videos we call spliks. 
              It's designed for fast, expressive, and playful communication where every second counts. Instead of long content feeds, 
              Splikz is all about micro-moments that go viral instantly.
            </p>
          </CardContent>
        </Card>

        {/* Why Splikz */}
        <Card className="mb-8">
          <CardContent className="p-8">
            <h2 className="text-2xl font-semibold mb-6 flex items-center">
              <Zap className="h-6 w-6 mr-2 text-primary" />
              Why Splikz?
            </h2>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="h-2 w-2 rounded-full bg-primary mt-2 mr-3 flex-shrink-0"></div>
                <div>
                  <span className="font-semibold">Short + Impactful:</span>
                  <span className="text-muted-foreground ml-2">Every splik is just 2–3 seconds. Quick to make, quick to watch.</span>
                </div>
              </div>
              <div className="flex items-start">
                <div className="h-2 w-2 rounded-full bg-primary mt-2 mr-3 flex-shrink-0"></div>
                <div>
                  <span className="font-semibold">Creative First:</span>
                  <span className="text-muted-foreground ml-2">Expression through motion, gestures, and vibes — not just text.</span>
                </div>
              </div>
              <div className="flex items-start">
                <div className="h-2 w-2 rounded-full bg-primary mt-2 mr-3 flex-shrink-0"></div>
                <div>
                  <span className="font-semibold">Global & Inclusive:</span>
                  <span className="text-muted-foreground ml-2">Non-verbal communication breaks down language barriers.</span>
                </div>
              </div>
              <div className="flex items-start">
                <div className="h-2 w-2 rounded-full bg-primary mt-2 mr-3 flex-shrink-0"></div>
                <div>
                  <span className="font-semibold">Safe by Default:</span>
                  <span className="text-muted-foreground ml-2">Smart moderation, optional city-level discovery (never exact location), and built-in teen protections.</span>
                </div>
              </div>
              <div className="flex items-start">
                <div className="h-2 w-2 rounded-full bg-primary mt-2 mr-3 flex-shrink-0"></div>
                <div>
                  <span className="font-semibold">Free Forever:</span>
                  <span className="text-muted-foreground ml-2">Anyone can join, post, and react without paying.</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What Makes Us Different */}
        <Card className="mb-8 border-primary/20">
          <CardContent className="p-8">
            <h2 className="text-2xl font-semibold mb-6 flex items-center">
              <TrendingUp className="h-6 w-6 mr-2 text-primary" />
              What Makes Us Different
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Not Another Instagram or TikTok Clone</span> — Splikz is focused entirely on micro-loops.
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Ignite Program (Creator Rewards):</span> Once you reach 1,000 followers and 10,000 views, 
                  you unlock Splikz's Ignite earnings system, rewarding not just views but conversations sparked.
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Amplify for Brands & Creators:</span> Pay to boost your splik across the app if you want 
                  more reach — no hidden algorithms, just transparent amplification.
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">Gesture Replies:</span> You can respond with a splik instead of text, 
                  creating entire motion-based conversations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Our Mission */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-3 flex items-center">
                <Rocket className="h-5 w-5 mr-2 text-primary" />
                Our Mission
              </h3>
              <p className="text-muted-foreground">
                To create the world's most lovable short-video community, where anyone can connect, express, and go viral in just a few seconds.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-3 flex items-center">
                <Heart className="h-5 w-5 mr-2 text-primary" />
                Our Promise
              </h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>No paywalls. Posting, reacting, and connecting will always be free.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Transparent growth. You'll always know how your spliks spread.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Community-first. Safety, inclusivity, and creative freedom are at the heart of Splikz.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Join the Movement */}
        <Card className="bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-semibold mb-4">Join the Movement</h2>
            <p className="text-muted-foreground mb-6">
              Whether you're here to laugh, vibe, create, or go viral, Splikz is where short videos live big.
            </p>
            <p className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Splikz — Short. Sweet. Viral.
            </p>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default About;