import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Search, HelpCircle, BookOpen, MessageCircle, Settings, Video, Shield, CreditCard, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const HelpCenter = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllArticles, setShowAllArticles] = useState(false);

  const allArticles = {
    "How do I create a splik?": {
      category: "Getting Started",
      content: "Creating a splik is easy! Simply tap the '+' button on the home screen, record your 3-second video using gestures to communicate your message, add a caption if desired, and tap 'Share'. Your splik will be instantly available for others to discover and enjoy."
    },
    "What is amplification?": {
      category: "Amplification & Credits",
      content: "Amplification is Splikz's unique feature that boosts your content's reach. By using credits, you can amplify your spliks to reach a wider audience beyond your followers. The more credits you use, the greater the potential reach. Credits can be purchased in the app or earned through various activities."
    },
    "How to gain more followers": {
      category: "Getting Started",
      content: "To grow your following on Splikz: Create engaging and creative 3-second spliks regularly, use trending gestures and participate in challenges, engage with other users' content, optimize your profile with a clear bio and profile picture, use amplification strategically to reach new audiences, and collaborate with other creators."
    },
    "Understanding privacy settings": {
      category: "Safety & Privacy",
      content: "Splikz offers comprehensive privacy controls. You can make your profile private (only approved followers can see your spliks), control who can message you, manage who can comment on your spliks, block specific users, and report inappropriate content. Access these settings from your profile menu under 'Privacy & Safety'."
    },
    "How to report inappropriate content": {
      category: "Safety & Privacy",
      content: "To report content that violates our community guidelines: Tap the three dots on any splik, select 'Report', choose the reason for reporting (spam, inappropriate content, harassment, etc.), add additional details if needed, and submit. Our moderation team reviews all reports within 24 hours."
    },
    "Troubleshooting video upload issues": {
      category: "Getting Started",
      content: "If you're having trouble uploading spliks: Check your internet connection, ensure the video is exactly 3 seconds, verify you have enough storage space, try closing and reopening the app, clear the app cache in your device settings, or update to the latest version of Splikz. If issues persist, contact support at info@splikz.com."
    },
    "How to create your first splik": {
      category: "Getting Started",
      content: "Welcome to Splikz! To create your first splik: Open the app and tap the '+' button, hold down the record button for exactly 3 seconds, use gestures to express yourself creatively, review your splik and add a caption, tap 'Share' to post. Remember, the 3-second limit encourages creativity and keeps content engaging!"
    },
    "Understanding the 3-second format": {
      category: "Getting Started",
      content: "The 3-second format is what makes Splikz unique. This constraint encourages creativity, ensures content is quick to consume, reduces bandwidth usage, and makes every moment count. Use gestures, expressions, and movement to convey your message effectively in this short timeframe."
    },
    "Using gestures effectively": {
      category: "Getting Started",
      content: "Gestures are the language of Splikz! Tips for effective gestures: Keep movements clear and deliberate, use universal gestures when possible, combine facial expressions with hand movements, practice timing to fit within 3 seconds, watch trending spliks for inspiration, and develop your unique gesture style."
    },
    "Updating your profile": {
      category: "Account Settings",
      content: "To update your profile: Go to your profile tab, tap 'Edit Profile', update your profile picture by tapping the camera icon, edit your bio (keep it concise and engaging), add links to other social media, update your display name, and save changes. Your profile is your identity on Splikz - make it memorable!"
    },
    "Privacy settings": {
      category: "Account Settings",
      content: "Customize your privacy: Navigate to Settings > Privacy, toggle 'Private Account' to approve followers manually, manage who can message you (Everyone, Followers, or No one), control who can comment on your spliks, enable/disable location sharing, manage data sharing preferences, and review blocked users list."
    },
    "Notification preferences": {
      category: "Account Settings",
      content: "Control your notifications: Go to Settings > Notifications, toggle push notifications on/off, customize alerts for: new followers, comments, messages, amplification results, trending spliks, and app updates. You can also set quiet hours to avoid notifications during specific times."
    },
    "Blocking users": {
      category: "Safety & Privacy",
      content: "To block a user: Visit their profile or tap their username, tap the three dots menu, select 'Block User', confirm your action. Blocked users cannot: view your spliks, send you messages, comment on your content, or find you in search. You can unblock users anytime from Settings > Privacy > Blocked Users."
    },
    "Reporting content": {
      category: "Safety & Privacy",
      content: "Help keep Splikz safe by reporting violations: Tap the three dots on any content, select 'Report', choose the violation type (spam, harassment, inappropriate content, copyright, etc.), provide additional context if needed, submit the report. Our team reviews reports within 24 hours and takes appropriate action."
    },
    "How amplification works": {
      category: "Amplification & Credits",
      content: "Amplification boosts your splik's visibility: Select a splik to amplify, choose the number of credits to use (more credits = greater reach), select your target audience (optional), confirm and launch amplification. Your splik will be shown to more users beyond your follower base, increasing engagement and potential new followers."
    },
    "Purchasing credits": {
      category: "Amplification & Credits",
      content: "Get credits to amplify your content: Go to your profile, tap the credits balance, choose a credit package (various options available), complete secure payment via card or in-app purchase, credits are instantly added to your account. Watch for special promotions and bulk discounts for better value!"
    },
    "Amplification best practices": {
      category: "Amplification & Credits",
      content: "Maximize your amplification impact: Amplify high-quality, engaging spliks, time amplification when your audience is most active, use targeted amplification for specific demographics, start with smaller amplifications to test performance, analyze results to refine your strategy, combine amplification with trending topics for best results."
    }
  };

  const categories = [
    {
      icon: <Video className="h-5 w-5" />,
      title: "Getting Started",
      description: "Learn the basics of creating and sharing spliks",
      articles: ["How to create your first splik", "Understanding the 3-second format", "Using gestures effectively"]
    },
    {
      icon: <Settings className="h-5 w-5" />,
      title: "Account Settings",
      description: "Manage your profile and preferences",
      articles: ["Updating your profile", "Privacy settings", "Notification preferences"]
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Safety & Privacy",
      description: "Keep your account secure",
      articles: ["Blocking users", "Reporting content"]
    },
    {
      icon: <CreditCard className="h-5 w-5" />,
      title: "Amplification & Credits",
      description: "Boost your content reach",
      articles: ["How amplification works", "Purchasing credits", "Amplification best practices"]
    }
  ];

  const popularArticles = [
    "How do I create a splik?",
    "What is amplification?",
    "How to gain more followers",
    "Understanding privacy settings",
    "How to report inappropriate content",
    "Troubleshooting video upload issues"
  ];

  const filteredArticles = Object.entries(allArticles).filter(([title, article]) =>
    title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const scrollToArticle = (articleId: string) => {
    setShowAllArticles(true);
    setTimeout(() => {
      const element = document.getElementById(articleId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Open the accordion item
        const trigger = element.querySelector('button');
        if (trigger) trigger.click();
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Header />
      <div className="container max-w-6xl mx-auto py-12 px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-4">
            How can we help you?
          </h1>
          <p className="text-muted-foreground mb-8">Search our help center or browse categories below</p>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-6 text-lg"
            />
          </div>
        </div>

        {/* Search Results */}
        {searchQuery && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Search className="h-5 w-5 mr-2" />
                Search Results ({filteredArticles.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {filteredArticles.map(([title, article], index) => (
                  <AccordionItem key={index} value={`search-${index}`}>
                    <AccordionTrigger className="text-left hover:no-underline">
                      <div className="flex-1">
                        <div className="font-medium">{title}</div>
                        <div className="text-xs text-muted-foreground mt-1">{article.category}</div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-muted-foreground">{article.content}</p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {!searchQuery && !showAllArticles && (
          <>
            {/* Popular Articles */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BookOpen className="h-5 w-5 mr-2" />
                  Popular Articles
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {popularArticles.map((title, index) => (
                    <AccordionItem key={index} value={`popular-${index}`}>
                      <AccordionTrigger className="text-left hover:no-underline">
                        <div className="flex-1">
                          <div className="font-medium">{title}</div>
                          <div className="text-xs text-muted-foreground mt-1">{allArticles[title].category}</div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="text-muted-foreground">{allArticles[title].content}</p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>

            {/* Categories */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {categories.map((category, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center text-lg">
                      <span className="text-primary mr-2">{category.icon}</span>
                      {category.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{category.description}</p>
                    <Accordion type="single" collapsible className="w-full">
                      {category.articles.map((article, articleIndex) => (
                        <AccordionItem key={articleIndex} value={`${category.title}-${articleIndex}`}>
                          <AccordionTrigger className="text-sm hover:no-underline py-3">
                            {article}
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className="text-sm text-muted-foreground">{allArticles[article].content}</p>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* All Articles View */}
        {showAllArticles && !searchQuery && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <BookOpen className="h-5 w-5 mr-2" />
                  All Articles
                </span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowAllArticles(false)}
                >
                  Back to Categories
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {Object.entries(allArticles).map(([title, article], index) => (
                  <AccordionItem key={index} value={`all-${index}`} id={`article-${index}`}>
                    <AccordionTrigger className="text-left hover:no-underline">
                      <div className="flex-1">
                        <div className="font-medium">{title}</div>
                        <div className="text-xs text-muted-foreground mt-1">{article.category}</div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-muted-foreground">{article.content}</p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Contact Options */}
        <Card className="bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardContent className="py-8">
            <div className="text-center">
              <HelpCircle className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h2 className="text-2xl font-semibold mb-2">Still need help?</h2>
              <p className="text-muted-foreground mb-6">
                Our support team is here to assist you
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                <Link to="/contact">
                  <Button className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Contact Support
                  </Button>
                </Link>
                <Button 
                  variant="outline"
                  onClick={() => setShowAllArticles(!showAllArticles)}
                >
                  {showAllArticles ? 'View Categories' : 'Browse All Articles'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default HelpCenter;