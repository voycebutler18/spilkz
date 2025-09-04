import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Sparkles, TrendingUp, Clock, Search, Copy, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const promptCategories = [
  {
    title: "Trending Prompts",
    icon: TrendingUp,
    prompts: [
      { text: "React to this with your best dance move", category: "Dance", uses: 1542 },
      { text: "Show me your morning routine in 3 seconds", category: "Lifestyle", uses: 1234 },
      { text: "POV: You just won the lottery", category: "Acting", uses: 987 },
      { text: "Recreate this with your pet", category: "Pets", uses: 876 },
      { text: "Your face when Monday hits", category: "Funny", uses: 654 }
    ]
  },
  {
    title: "Creative Challenges",
    icon: Sparkles,
    prompts: [
      { text: "Transform into 3 different characters", category: "Acting", uses: 543 },
      { text: "Tell a story without words", category: "Creative", uses: 432 },
      { text: "Show your hidden talent", category: "Talent", uses: 321 },
      { text: "Create an optical illusion", category: "Visual", uses: 234 },
      { text: "Make everyday objects come alive", category: "Creative", uses: 198 }
    ]
  },
  {
    title: "Quick Reactions",
    icon: Clock,
    prompts: [
      { text: "Your reaction to your favorite food", category: "Food", uses: 765 },
      { text: "Before vs After coffee", category: "Lifestyle", uses: 654 },
      { text: "Expectation vs Reality", category: "Funny", uses: 543 },
      { text: "Your face when someone spoils the movie", category: "Reaction", uses: 432 },
      { text: "When your song comes on", category: "Music", uses: 321 }
    ]
  }
];

const Prompts = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = ["all", "Dance", "Lifestyle", "Acting", "Funny", "Creative", "Talent", "Food", "Music", "Reaction"];

  const handleCopyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(prompt);
    toast.success("Prompt copied to clipboard!");
    
    setTimeout(() => {
      setCopiedPrompt(null);
    }, 2000);
  };

  const filterPrompts = (prompts: any[]) => {
    return prompts.filter(prompt => {
      const matchesSearch = prompt.text.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "all" || prompt.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
            Creative Prompts
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get inspired with trending prompts and creative challenges. Copy, create, and share your unique 3-second stories!
          </p>
        </div>

        {/* Search and Filter */}
        <div className="mb-8 space-y-4">
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {categories.map(category => (
              <Badge
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                className="cursor-pointer py-2 px-4"
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </Badge>
            ))}
          </div>
        </div>

        {/* Prompt Categories */}
        <Tabs defaultValue="trending" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3">
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="creative">Creative</TabsTrigger>
            <TabsTrigger value="quick">Quick</TabsTrigger>
          </TabsList>

          {promptCategories.map((category, index) => (
            <TabsContent 
              key={index} 
              value={index === 0 ? "trending" : index === 1 ? "creative" : "quick"}
              className="mt-8"
            >
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filterPrompts(category.prompts).map((prompt, promptIndex) => (
                  <Card key={promptIndex} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <Badge variant="secondary">{prompt.category}</Badge>
                        <span className="text-xs text-muted-foreground">{prompt.uses} uses</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-4 line-clamp-2">{prompt.text}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => handleCopyPrompt(prompt.text)}
                      >
                        {copiedPrompt === prompt.text ? (
                          <>
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Prompt
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {filterPrompts(category.prompts).length === 0 && (
                <Card className="p-8 text-center">
                  <CardContent>
                    <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No prompts found matching your criteria</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Call to Action */}
        <Card className="mt-12 bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Ready to Create?</CardTitle>
            <CardDescription className="text-base">
              Pick a prompt and start creating your 3-second masterpiece!
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button
              size="lg"
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
              onClick={() => window.location.href = '/dashboard'}
            >
              Start Creating
            </Button>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
};

export default Prompts;