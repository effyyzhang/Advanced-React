import Link from "next/link";
import CreateItem from "../components/CreateItem";
import SignInGate from "../components/SignInGate";
const Sell = (props) => (
  <SignInGate>
    <CreateItem />
  </SignInGate>
);
export default Sell;
