import React from "react";
import { Query } from "react-apollo";
import { CURRENT_USER_QUERY } from "./User";
import Signin from "./Signin";

const SignInGate = (props) => (
  <Query query={CURRENT_USER_QUERY}>
    {({ data, loading }) => {
      if (loading) return <p>Loading...</p>;
      if (!data.me) {
        return (
          <div>
            <h2>Please Signin</h2>
            <Signin />
          </div>
        );
      }
      return props.children;
    }}
  </Query>
);

export default SignInGate;
