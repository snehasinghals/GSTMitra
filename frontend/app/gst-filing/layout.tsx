import { FilingSubNav } from "../components/FilingSubNav";

export default function GstFilingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <FilingSubNav />
      {children}
    </div>
  );
}
