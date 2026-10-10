import { Link } from 'react-router-dom';
import { StampThump } from '../components/motion/StampThump';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center px-gutter py-20 text-center">
      <StampThump label="Lost" sub="luggage" tone="bad" size="lg" />
      <h1 className="mt-8 text-3xl">We could not find that page</h1>
      <Link to="/home" className="mt-6 inline-flex min-h-tap items-center rounded-pill bg-ink px-6 font-medium text-ivory">
        Go home
      </Link>
    </div>
  );
}
