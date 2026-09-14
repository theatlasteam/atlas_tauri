import { useNavigate, useParams } from "@solidjs/router";
import CanvasBoard from "../components/CanvasBoard";

export default function CanvasView() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  return <CanvasBoard id={params.id} onClose={() => navigate(-1)} />;
}
