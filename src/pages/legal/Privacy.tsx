// src/pages/legal/Privacy.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Privacy = () => {
  const lastUpdated = new Date().toLocaleDateString();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Privacy Policy
            </CardTitle>
            <p className="text-muted-foreground mt-2">
              Last updated: {lastUpdated}
            </p>
          </CardHeader>

          <CardContent className="prose prose-neutral dark:prose-invert max-w-none">
            {/* Intro */}
            <p className="lead">
              This Privacy Policy explains how Splikz (“we,” “our,” or “us”) collects,
              uses, and shares information about you when you use our website, apps,
              and related services (the “Service”).
            </p>

            {/* Quick summary */}
            <div className="rounded-lg border bg-muted/30 p-4 not-prose mb-6">
              <div className="text-sm text-muted-foreground">
                <strong>Quick summary:</strong> We collect the info you give us (like email and
                uploads) and some device/usage data to run and improve Splikz, keep it safe,
                and help you discover content. We don’t sell your personal information.
              </div>
            </div>

            {/* TOC */}
            <ol className="text-sm md:text-base !mt-0">
              <li><a href="#info-we-collect">Information We Collect</a></li>
              <li><a href="#how-we-use">How We Use Information</a></li>
              <li><a href="#sharing">How We Share Information</a></li>
              <li><a href="#security">Security</a></li>
              <li><a href="#your-rights">Your Rights & Choices</a></li>
              <li><a href="#cookies">Cookies & Similar Technologies</a></li>
              <li><a href="#children">Children’s Privacy</a></li>
              <li><a href="#intl">International Transfers</a></li>
              <li><a href="#retention">Data Retention</a></li>
              <li><a href="#changes">Changes to This Policy</a></li>
              <li><a href="#contact">Contact Us</a></li>
              <li><a href="#ip">Content & Intellectual Property</a></li>
            </ol>

            <h2 id="info-we-collect">1. Information We Collect</h2>
            <p>We collect information in the following ways:</p>
            <ul>
              <li>
                <strong>Information you provide</strong> (e.g., when you create an account,
                upload content, or contact support): username, email, password, display name,
                bio, avatar, and any content you post (e.g., titles, captions, comments).
              </li>
              <li>
                <strong>Automatic data</strong> about your device and usage: IP address,
                device identifiers, browser type, pages viewed, timestamps, referring/exit pages,
                approximate location (based on IP), and interactions (likes, follows, searches).
              </li>
              <li>
                <strong>Information from cookies</strong> and similar technologies (see Section 6).
              </li>
              <li>
                <strong>Third-party service data</strong> if you connect accounts or use integrated
                features (subject to their privacy policies).
              </li>
            </ul>

            <h2 id="how-we-use">2. How We Use Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Provide, maintain, and improve the Service (including hosting and transcoding uploads).</li>
              <li>Personalize your experience and content discovery.</li>
              <li>Detect, prevent, and address fraud, abuse, security, and technical issues.</li>
              <li>Send service messages (e.g., account, security, support).</li>
              <li>Analyze trends and measure performance.</li>
              <li>Comply with applicable laws and enforce our terms and policies.</li>
            </ul>

            <h2 id="sharing">3. How We Share Information</h2>
            <p>
              We do <strong>not</strong> sell your personal information. We may share information:
            </p>
            <ul>
              <li>
                <strong>With service providers</strong> who help us operate the Service (e.g., cloud hosting,
                storage, analytics) under contracts that limit how they can use your data.
              </li>
              <li>
                <strong>For legal reasons</strong> (e.g., to comply with law, enforce terms, protect rights,
                safety, and security).
              </li>
              <li>
                <strong>During a change of control</strong> (e.g., merger, acquisition); your information
                may be transferred to a successor subject to this Policy.
              </li>
            </ul>

            <h2 id="security">4. Security</h2>
            <p>
              We use appropriate technical and organizational measures to protect personal
              information against unauthorized access, alteration, disclosure, or destruction.
              However, no method of transmission or storage is 100% secure.
            </p>

            <h2 id="your-rights">5. Your Rights & Choices</h2>
            <ul>
              <li>
                <strong>Access, correction, deletion:</strong> You can access and update certain
                profile info in your account settings. You can also request deletion of your account.
              </li>
              <li>
                <strong>Opt-outs:</strong> You can manage cookies in your browser. You can opt out
                of non-essential emails by using unsubscribe links or contacting us.
              </li>
              <li>
                <strong>EEA/UK/CA residents:</strong> You may have additional rights (e.g., portability,
                objection, restriction) subject to local laws. Contact us to exercise them.
              </li>
            </ul>

            <h2 id="cookies">6. Cookies & Similar Technologies</h2>
            <p>
              We use cookies and similar technologies to operate the Service, remember your settings,
              and analyze usage. You can refuse cookies in your browser settings, but some features
              may not work properly.
            </p>

            <h2 id="children">7. Children’s Privacy</h2>
            <p>
              The Service is not directed to children under 13, and we do not knowingly collect
              personal information from children under 13. If you believe a child has provided
              us personal information, please contact us so we can take appropriate steps.
            </p>

            <h2 id="intl">8. International Transfers</h2>
            <p>
              We may process and store information in countries other than where you live.
              We take steps to ensure appropriate safeguards are in place when transferring data.
            </p>

            <h2 id="retention">9. Data Retention</h2>
            <p>
              We retain information for as long as necessary to provide the Service and for
              legitimate business or legal purposes. Retention periods vary based on the type of data
              and our obligations.
            </p>

            <h2 id="changes">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes,
              we will notify you (for example, by posting here or via email). Your continued use
              of the Service means you accept the updated Policy.
            </p>

            <h2 id="contact">11. Contact Us</h2>
            <p>
              Questions or requests? Email us at <a href="mailto:info@splikz.com">info@splikz.com</a>.
            </p>

            {/* Content & IP section you asked to include */}
            <h2 id="ip">12. Content & Intellectual Property</h2>
            <p>
              The following terms explain ownership of content and rights related to the Service.
              For full legal terms, please also review our Terms of Service.
            </p>

            <h3>Ownership</h3>
            <p>
              You retain all rights in content you upload (“User Content”). Except for the license
              granted below, we do not claim ownership of User Content.
            </p>

            <h3>License to Splikz</h3>
            <p>
              You grant Splikz a worldwide, non-exclusive, royalty-free, transferable and
              sublicensable license to host, store, transcode, reproduce, adapt, distribute,
              publicly perform and display User Content in connection with operating, improving,
              and promoting the Service, including in social posts, emails, and app listings.
            </p>

            <h3>Feedback</h3>
            <p>
              You grant Splikz a perpetual, irrevocable, royalty-free license to use ideas
              or feedback you provide.
            </p>

            <h3>Platform IP</h3>
            <p>
              The Splikz Service, software, brand, logos, and the compilation of content are owned
              by Splikz and protected by copyright and trademark laws. No rights are granted
              except as expressly stated.
            </p>

            <h3>Prohibited Uses</h3>
            <p>No scraping, bulk-downloading, or reverse engineering. Don’t upload unlawful or infringing content.</p>

            <h3>Takedowns</h3>
            <p>
              We respond to notices that reasonably allege infringement and may remove content
              or terminate accounts.
            </p>

            <p className="text-xs text-muted-foreground mt-8">
              This Privacy Policy is provided for transparency and does not create
              contractual rights. For binding legal terms, please refer to our Terms of Service.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Privacy;
