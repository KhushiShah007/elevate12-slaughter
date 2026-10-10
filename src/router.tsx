import { createBrowserRouter } from 'react-router-dom';
import { AppShell, BareShell } from './components/layout/AppShell';
import Splash from './screens/onboarding/Splash';
import Welcome from './screens/onboarding/Welcome';
import SignUp from './screens/onboarding/SignUp';
import Login from './screens/onboarding/Login';
import Otp from './screens/onboarding/Otp';
import SetPassword from './screens/onboarding/SetPassword';
import PersonaQuiz from './screens/onboarding/PersonaQuiz';
import Home from './screens/home/Home';
import TripsList from './screens/trips/TripsList';
import NewTrip from './screens/trips/NewTrip';
import CompletedTrip from './screens/trips/CompletedTrip';
import TripWorkspace from './screens/trips/TripWorkspace';
import Flights from './screens/modules/Flights';
import Documents from './screens/modules/Documents';
import Transportation from './screens/modules/Transportation';
import Accommodation from './screens/modules/Accommodation';
import Budget from './screens/modules/Budget';
import Experiences from './screens/modules/Experiences';
import Itinerary from './screens/modules/Itinerary';
import Restaurants from './screens/modules/Restaurants';
import ActiveTrip from './screens/active/ActiveTrip';
import Disruption from './screens/active/Disruption';
import Assistant from './screens/assistant/Assistant';
import Wallet from './screens/wallet/Wallet';
import DocumentViewer from './screens/wallet/DocumentViewer';
import ScanToPdf from './screens/wallet/ScanToPdf';
import Me from './screens/me/Me';
import FamilyPickup from './screens/share/FamilyPickup';
import JudgeMode from './screens/judge/JudgeMode';
import NotFound from './screens/NotFound';
import Credits from './screens/Credits';
import Destinations from './screens/destinations/Destinations';
import DestinationDetail from './screens/destinations/DestinationDetail';

export const router = createBrowserRouter([
  {
    // No app chrome (and no points pill): onboarding, public share page, Judge Mode
    element: <BareShell />,
    children: [
      { path: '/', element: <Splash /> },
      { path: '/welcome', element: <Welcome /> },
      { path: '/signup', element: <SignUp /> },
      { path: '/login', element: <Login /> },
      { path: '/otp', element: <Otp /> },
      { path: '/set-password', element: <SetPassword /> },
      { path: '/quiz', element: <PersonaQuiz /> },
      { path: '/share/:token', element: <FamilyPickup /> },
      { path: '/judge', element: <JudgeMode /> },
      { path: '/credits', element: <Credits /> },
    ],
  },
  {
    // In-app screens: top bar with points pill + bottom nav
    element: <AppShell />,
    children: [
      { path: '/home', element: <Home /> },
      { path: '/trips', element: <TripsList /> },
      { path: '/trips/new', element: <NewTrip /> },
      { path: '/trips/:tripId', element: <TripWorkspace /> },
      { path: '/trips/:tripId/memories', element: <CompletedTrip /> },
      { path: '/trips/:tripId/flights', element: <Flights /> },
      { path: '/trips/:tripId/documents', element: <Documents /> },
      { path: '/trips/:tripId/transportation', element: <Transportation /> },
      { path: '/trips/:tripId/accommodation', element: <Accommodation /> },
      { path: '/trips/:tripId/budget', element: <Budget /> },
      { path: '/trips/:tripId/experiences', element: <Experiences /> },
      { path: '/trips/:tripId/itinerary', element: <Itinerary /> },
      { path: '/trips/:tripId/restaurants', element: <Restaurants /> },
      { path: '/trips/:tripId/active', element: <ActiveTrip /> },
      { path: '/trips/:tripId/disruption/:type', element: <Disruption /> },
      { path: '/destinations', element: <Destinations /> },
      { path: '/destinations/:slug', element: <DestinationDetail /> },
      { path: '/assistant', element: <Assistant /> },
      { path: '/wallet', element: <Wallet /> },
      { path: '/wallet/scan', element: <ScanToPdf /> },
      { path: '/wallet/:docId', element: <DocumentViewer /> },
      { path: '/me', element: <Me /> },
      { path: '*', element: <NotFound /> },
    ],
  },
], {
  // Opt in to React Router v7 behaviour now (also silences its upgrade warnings).
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});
