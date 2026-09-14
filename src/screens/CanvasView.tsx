import { useNavigate, useParams } from "@solidjs/router";
import CanvasBoard from "../components/CanvasBoard";

export default function CanvasView() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <div class="h-full min-h-0 touch-none overscroll-none">
      <CanvasBoard id={params.id} onClose={() => navigate(-1)} />
    </div>
  );
}
