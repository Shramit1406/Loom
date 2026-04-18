import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Feather, Camera, Mic, WifiOff, Heart, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoomLogo from "@/components/LoomLogo";
import { useLoom } from "@/context/LoomContext";

const Index = () => {
  const { profile } = useLoom();
  const ctaTo = profile ? "/dashboard" : "/onboarding";
  const ctaLabel = profile ? "Open your dashboard" : "Start weaving memories";

  return (
    <main className="min-h-screen relative overflow-hidden bg-background">
      {/* Floating soft blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full gradient-sage opacity-30 blur-3xl animate-blob" />
        <div className="absolute top-1/3 -right-32 w-[32rem] h-[32rem] rounded-full gradient-peach opacity-40 blur-3xl animate-blob" style={{ animationDelay: "4s" }} />
        <div className="absolute bottom-0 left-1/3 w-[24rem] h-[24rem] rounded-full gradient-lavender opacity-50 blur-3xl animate-blob" style={{ animationDelay: "8s" }} />
      </div>

      {/* Nav */}
      <nav className="relative z-10 container flex items-center justify-between py-6">
        <LoomLogo />
        <div className="hidden sm:flex items-center gap-8 text-base">
          <a href="#features" className="text-foreground/70 hover:text-foreground">Features</a>
          <a href="#how" className="text-foreground/70 hover:text-foreground">How it works</a>
        </div>
        <Link to={ctaTo}>
          <Button className="loom-tap rounded-full h-11 px-5 gradient-sage text-white shadow-soft hover:shadow-glow">
            {profile ? "Open app" : "Launch"}
          </Button>
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative z-10 container pt-12 pb-24 md:pt-20 md:pb-32">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full bg-accent-soft border border-accent/40 px-4 py-1.5 text-sm text-foreground/80 mb-8"
          >
            <Heart className="w-4 h-4 text-primary" />
            For those who forget. For those who remember for them.
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-semibold leading-[1.05] tracking-tight"
          >
            Weaving
            <br />
            <span className="italic text-primary">memories</span>
            <br />
            back together.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 text-lg md:text-xl text-foreground/70 leading-relaxed max-w-2xl mx-auto"
          >
            Your voice. Your people. Your anchor. Loom helps dementia patients recognize loved
            ones through gentle face recognition and their own calming voice.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to={ctaTo}>
              <Button size="lg" className="loom-tap rounded-full h-14 px-8 text-lg gradient-sage text-white shadow-soft hover:shadow-glow">
                {ctaLabel}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="outline" className="loom-tap rounded-full h-14 px-8 text-lg border-2 border-primary/30 hover:bg-primary-soft">
                Watch how it works
              </Button>
            </a>
          </motion.div>
        </div>

        {/* Hero card preview */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-20 max-w-2xl mx-auto"
        >
          <div className="loom-card animate-float">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl gradient-peach flex items-center justify-center">
                <Mic className="w-8 h-8 text-foreground/70" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm text-muted-foreground">Anchor voice playing…</p>
                <p className="text-lg">"This is Sarah. She's your daughter. She loves you."</p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 container pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Camera, title: "Face Recognition", body: "Gently identifies familiar faces and plays your own voice explaining who they are.", grad: "gradient-sage" },
            { icon: Mic, title: "Your Voice", body: "Your own recorded voice is the most trusted anchor. We use it to calm and reassure.", grad: "gradient-peach" },
            { icon: WifiOff, title: "Offline SOS", body: "Bluetooth mesh sends alerts to nearby caregivers. No internet needed.", grad: "gradient-lavender" },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="loom-card"
            >
              <div className={`w-14 h-14 rounded-2xl ${f.grad} flex items-center justify-center mb-5`}>
                <f.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-semibold mb-2">{f.title}</h3>
              <p className="text-base text-foreground/70 leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 container pb-32">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">How Loom works</h2>
          <p className="mt-4 text-lg text-foreground/70">Three gentle steps. No internet required.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { n: "01", t: "Record your anchor", b: "You record your own voice saying 'My name is… I am safe.' This becomes your calming anchor." },
            { n: "02", t: "Add your people", b: "Photo, name, relationship, and a short voice note from you about each person." },
            { n: "03", t: "Open camera anytime", b: "Loom recognizes their face and plays your voice — no internet, no waiting." },
          ].map((s) => (
            <div key={s.n} className="loom-card">
              <div className="text-sm text-primary font-mono mb-3">{s.n}</div>
              <h3 className="text-xl font-semibold mb-2">{s.t}</h3>
              <p className="text-base text-foreground/70 leading-relaxed">{s.b}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link to={ctaTo}>
            <Button size="lg" className="loom-tap rounded-full h-14 px-8 text-lg gradient-sage text-white shadow-soft">
              {ctaLabel}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/60 py-10">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <Feather className="w-4 h-4 text-primary" />
            <span>Loom — Weaving memories back together.</span>
          </div>
          <div className="flex gap-6">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
          </div>
        </div>
      </footer>
    </main>
  );
};

export default Index;
