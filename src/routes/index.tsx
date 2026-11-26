import { createFileRoute } from "@tanstack/react-router";
import { VisAVis } from "@/components/vis-a-vis";

export const Route = createFileRoute("/")({ component: VisAVis });
