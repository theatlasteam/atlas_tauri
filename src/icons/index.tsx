import {
  ChatCircle,
  Gear,
  UserCircle,
  ArrowLeft,
  PaperPlaneRight,
  CaretDown,
  CaretRight,
  Check,
  Checks,
  Plus,
  Trash,
  ArrowDown,
  Bell,
  BellSlash,
  Image,
  TextAa,
  Folder,
  PencilSimple,
  Palette,
  ShieldCheck,
  Phone,
  PhoneSlash,
  VideoCamera,
  VideoCameraSlash,
  Camera,
  Microphone,
  MicrophoneSlash,
  MagnifyingGlass,
  X,
  Paperclip,
  Smiley,
  ArrowBendUpLeft,
  Lock,
  LockOpen,
  Users,
  SpeakerHigh,
  StopCircle,
  SignOut,
  WifiSlash,
  CircleNotch,
  DownloadSimple,
  Play,
  Pause,
  Wrench,
  Broom,
  Fingerprint,
  Prohibit,
  SealCheck,
  HourglassMedium,
  Eye,
  DotsThree,
  Minus,
  Square,
  CornersIn,
} from "phosphor-solid-js";
import type { JSX } from "solid-js";

export interface IconProps {
  class?: string;
  size?: number;
}

const weight = "regular" as const;

/** Icons are outlined app-wide; pass a weight to opt a single icon out (the
 * verified checkmark is filled, so it reads as a badge rather than a glyph). */
function wrap(Icon: any, iconWeight: "regular" | "fill" = weight) {
  return (p: IconProps): JSX.Element => <Icon size={p.size ?? 20} weight={iconWeight} class={p.class} />;
}

export const ChatIcon = wrap(ChatCircle);
export const SettingsIcon = wrap(Gear);
export const ProfileIcon = wrap(UserCircle);
export const BackIcon = wrap(ArrowLeft);
export const SendIcon = wrap(PaperPlaneRight);
export const ChevronDownIcon = wrap(CaretDown);
export const ChevronRightIcon = wrap(CaretRight);
export const CheckIcon = wrap(Check);
export const ChecksIcon = wrap(Checks);
export const PlusIcon = wrap(Plus);
export const TrashIcon = wrap(Trash);
export const ArrowDownIcon = wrap(ArrowDown);
export const BellIcon = wrap(Bell);
export const BellSlashIcon = wrap(BellSlash);
export const ImageIcon = wrap(Image);
export const FontIcon = wrap(TextAa);
export const FolderIcon = wrap(Folder);
export const EditIcon = wrap(PencilSimple);
export const PaletteIcon = wrap(Palette);
export const ShieldIcon = wrap(ShieldCheck);
export const PhoneIcon = wrap(Phone);
export const PhoneSlashIcon = wrap(PhoneSlash);
export const VideoIcon = wrap(VideoCamera);
export const CameraIcon = wrap(Camera);
export const VideoSlashIcon = wrap(VideoCameraSlash);
export const MicIcon = wrap(Microphone);
export const MicSlashIcon = wrap(MicrophoneSlash);
export const SearchIcon = wrap(MagnifyingGlass);
export const CloseIcon = wrap(X);
export const AttachIcon = wrap(Paperclip);
export const SmileyIcon = wrap(Smiley);
export const ReplyIcon = wrap(ArrowBendUpLeft);
export const LockIcon = wrap(Lock);
export const LockOpenIcon = wrap(LockOpen);
export const UsersIcon = wrap(Users);
export const SpeakerIcon = wrap(SpeakerHigh);
export const StopIcon = wrap(StopCircle);
export const SignOutIcon = wrap(SignOut);
export const OfflineIcon = wrap(WifiSlash);
export const SpinnerIcon = wrap(CircleNotch);
export const DownloadIcon = wrap(DownloadSimple);
export const PlayIcon = wrap(Play);
export const PauseIcon = wrap(Pause);
export const WrenchIcon = wrap(Wrench);
export const BroomIcon = wrap(Broom);
export const FingerprintIcon = wrap(Fingerprint);
export const ProhibitIcon = wrap(Prohibit);
export const VerifiedIcon = wrap(SealCheck, "fill");
/** Time capsules: a sealed message counting down to when it opens. */
export const HourglassIcon = wrap(HourglassMedium);
/** Live typing. */
export const EyeIcon = wrap(Eye);
/** Overflow actions on a message bubble (edit, unsend). */
export const DotsIcon = wrap(DotsThree);
/** Custom desktop titlebar window controls. */
export const MinimizeIcon = wrap(Minus);
export const MaximizeIcon = wrap(Square);
export const RestoreIcon = wrap(CornersIn);
