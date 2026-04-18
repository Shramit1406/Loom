import { Feather } from "lucide-react";
import { Link } from "react-router-dom";

export default function LoomLogo({ size = "md", linkTo }: { size?: "sm" | "md" | "lg"; linkTo?: string }) {
  const sizes = {
    sm: { icon: "w-7 h-7", text: "text-xl", box: "w-9 h-9" },
    md: { icon: "w-8 h-8", text: "text-2xl", box: "w-11 h-11" },
    lg: { icon: "w-10 h-10", text: "text-4xl", box: "w-14 h-14" },
  }[size];

  const inner = (
    <div className="flex items-center gap-3">
      <div className={`${sizes.box} rounded-2xl gradient-sage flex items-center justify-center shadow-soft`}>
        <Feather className={`${sizes.icon} text-white`} strokeWidth={2.2} />
      </div>
      <span className={`${sizes.text} font-semibold tracking-tight`}>Loom</span>
    </div>
  );

  if (linkTo) return <Link to={linkTo}>{inner}</Link>;
  return inner;
}
