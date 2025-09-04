import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, Target, Zap, BarChart, Award } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const ForBrands = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Header />
      <div className="container max-w-6xl mx-auto py-12 px-4">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
            Amplify Your Brand
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Connect with millions through authentic, engaging 3-second stories that capture attention and drive action
          </p>
          <div className="mt-8">
            <Link to="/contact">
              <Button size="lg" className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                Get Started
              </Button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardHeader>
              <TrendingUp className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Viral Potential</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Our 3-second format is designed for maximum shareability and engagement.
                Your message spreads faster and reaches further.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Users className="h-8 w-8 text-secondary mb-2" />
              <CardTitle>Authentic Connection</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Connect with Gen Z and millennials through genuine, gesture-based communication
                that feels natural and unscripted.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Target className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Targeted Reach</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Advanced targeting options ensure your content reaches the right audience
                at the right time for maximum impact.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Amplification Section */}
        <Card className="mb-12 bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardContent className="py-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-4">Amplification Technology</h2>
                <p className="text-muted-foreground mb-6">
                  Boost your content's visibility with our unique amplification system.
                  Get guaranteed impressions and engagement from your target demographic.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-center">
                    <Zap className="h-5 w-5 text-primary mr-2" />
                    <span>Instant visibility boost</span>
                  </li>
                  <li className="flex items-center">
                    <BarChart className="h-5 w-5 text-secondary mr-2" />
                    <span>Real-time analytics</span>
                  </li>
                  <li className="flex items-center">
                    <Award className="h-5 w-5 text-primary mr-2" />
                    <span>Performance guarantees</span>
                  </li>
                </ul>
              </div>
              <div className="bg-card p-6 rounded-lg">
                <h3 className="font-semibold mb-4">Campaign Types</h3>
                <div className="space-y-3">
                  <div className="p-3 bg-muted rounded">
                    <p className="font-medium">Brand Awareness</p>
                    <p className="text-sm text-muted-foreground">Maximize reach and impressions</p>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <p className="font-medium">Product Launch</p>
                    <p className="text-sm text-muted-foreground">Create buzz for new releases</p>
                  </div>
                  <div className="p-3 bg-muted rounded">
                    <p className="font-medium">Influencer Partnerships</p>
                    <p className="text-sm text-muted-foreground">Collaborate with top creators</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Why Choose Splikz */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center mb-8">Why Partner with Splikz?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="py-6">
                <h3 className="text-lg font-semibold mb-3">Growing Platform</h3>
                <p className="text-muted-foreground">
                  Be an early adopter on the fastest-growing gesture-based video platform.
                  Get in on the ground floor of the next social media revolution.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-6">
                <h3 className="text-lg font-semibold mb-3">Innovative Format</h3>
                <p className="text-muted-foreground">
                  Our unique 3-second format challenges brands to be creative and impactful,
                  resulting in memorable content that stands out.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <Card className="bg-gradient-to-r from-primary to-secondary text-white">
          <CardContent className="py-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Amplify Your Brand?</h2>
            <p className="mb-8 text-white/90">
              Join thousands of brands already connecting with millions on Splikz
            </p>
            <Link to="/contact">
              <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90">
                Contact Our Team
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default ForBrands;