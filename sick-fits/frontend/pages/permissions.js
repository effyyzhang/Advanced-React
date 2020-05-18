import SignInGate from "../components/SignInGate";
import Permissions from "../components/Permissions";
const PermissionsPage = (props) => (
  <SignInGate>
    <Permissions />
  </SignInGate>
);
export default PermissionsPage;
