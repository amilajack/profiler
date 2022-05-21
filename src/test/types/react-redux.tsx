/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */
import * as React from 'react';
import explicitConnect from '../../utils/connect';

import type {
  ConnectedProps,
  WrapDispatchProps,
  WrapFunctionInDispatch,
} from '../../utils/connect';
import type {
  State,
  Action,
  ThunkAction,
  Dispatch,
  GetState,
} from 'firefox-profiler/types';
/* eslint-disable no-unused-vars */

// Use this any value to create fake variables as a type. Consider using
// `declare var myVariables: MyType;` instead. However, it can sometimes be clearer to
// create values inline, or from pre-existing type definitions. In addition,
// `declare var` is not correctly lexically scoped.
const ANY_VALUE = (0 as any);

/**
 * These type tests create various values that should all type check correctly to show
 * that the react-redux system is working correctly.
 */

type OwnProps = {
  readonly ownPropString: string,
  readonly ownPropNumber: number
};

type StateProps = {
  readonly statePropString: string,
  readonly statePropNumber: number
};

type ExampleActionCreator = (arg1: string) => Action;
type ExampleThunkActionCreator = (arg1: string) => ThunkAction<number>;

type DispatchProps = {
  readonly dispatchString: ExampleActionCreator,
  readonly dispatchThunk: ExampleThunkActionCreator
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class ExampleComponent extends React.PureComponent<Props> {
  render() {
    // Ensure that the React component has the correct types inside of it.
    (this.props.ownPropString as string);
    (this.props.ownPropNumber as number);
    (this.props.statePropString as string);
    (this.props.statePropNumber as number);

    // The action creators are properly wrapped by dispatch.
    (this.props.dispatchString as (arg1: string) => Action);
    this.props.dispatchThunk as (arg1: string) => number;
    this.props.dispatchThunk('foo') as number;

    return null;
  }
}

const validMapStateToProps = (state: State, ownProps: OwnProps) => {
  // Coerce the inferred types, to ensure that we are doing the right thing.
  (state as State);
  (ownProps as OwnProps);
  return {
    statePropString: 'string',
    statePropNumber: 0,
  };
};

declare var validDispatchToProps: {
  readonly dispatchString: (arg1: string) => Action,
  readonly dispatchThunk: (arg1: string) => ThunkAction<number>
};

// This value also serves as a test for the common case of creating a component
// with valid values.
const ConnectedExampleComponent = explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: validMapStateToProps,
  mapDispatchToProps: validDispatchToProps,
  component: ExampleComponent,
});

{
  // Test that WrapDispatchProps modifies the ThunkActions.
  const wrapped: WrapDispatchProps<DispatchProps> = (ANY_VALUE as {
    readonly dispatchString: (arg1: string) => Action,
    readonly dispatchThunk: (arg1: string) => number
  });
}

{
  // Test that the original unwrapped action creators do not work.
  const wrapped: WrapDispatchProps<DispatchProps> = (ANY_VALUE as {
    readonly dispatchString: (arg1: string) => Action,
    // $FlowExpectError
    readonly dispatchThunk: (arg1: string) => ThunkAction<number>
  });
}

{
  // Test that WrapFunctionInDispatch works to strip off the return action.
  const exampleAction = (string: string) => (ANY_VALUE as Action);
  const exampleThunkAction =
    (string: string) => (dispatch: Dispatch, getState: GetState) =>
      (ANY_VALUE as number);
  const exampleThunkActionWrapped = (string: string) => 5;

  (exampleAction as WrapFunctionInDispatch<ExampleActionCreator>);
  (exampleThunkActionWrapped as WrapFunctionInDispatch<ExampleThunkActionCreator>);
  // $FlowExpectError
  (exampleThunkAction as WrapFunctionInDispatch<ExampleThunkActionCreator>);
}

{
  // Test that mapStateToProps will error out if provided an extra value.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    // $FlowExpectError
    mapStateToProps: (state) => ({
      statePropString: 'string',
      statePropNumber: 0,
      extraValue: null,
    }),
    mapDispatchToProps: validDispatchToProps,
    component: ExampleComponent,
  });
}

{
  // Test that mapStateToProps will error if provided an extra value.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    mapStateToProps: (state) => ({
      statePropString: 'string',
      // $FlowExpectError
      statePropNumber: 'not a number',
    }),
    mapDispatchToProps: validDispatchToProps,
    component: ExampleComponent,
  });
}

{
  // Test that mapDispatchToProps will error if a value is omitted.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    mapStateToProps: validMapStateToProps,
    // $FlowExpectError
    mapDispatchToProps: (ANY_VALUE as {
      readonly dispatchThunk: (arg1: string) => ThunkAction<number>
    }),
    component: ExampleComponent,
  });
}

{
  // Test that mapDispatchToProps will error if a variable type definition is wrong.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    mapStateToProps: validMapStateToProps,
    mapDispatchToProps: (ANY_VALUE as {
      // $FlowExpectError
      readonly dispatchString: (arg1: string) => string,
      readonly dispatchThunk: (arg1: string) => ThunkAction<number>
    }),
    component: ExampleComponent,
  });
}

{
  // Test that mapDispatchToProps will error if an extra property is given.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    mapStateToProps: validMapStateToProps,
    // $FlowExpectError
    mapDispatchToProps: (ANY_VALUE as (typeof validDispatchToProps) & {
      readonly extraProperty: (arg1: string) => string
    }),
    component: ExampleComponent,
  });
}

{
  // The connected component correctly takes OwnProps.
  <ConnectedExampleComponent ownPropString="string" ownPropNumber={0} />;
}

{
  // The connected component must not accept more props.
  // $FlowExpectError
  <ConnectedExampleComponent
    ownPropString="string"
    ownPropNumber={0}
    ownPropsExtra={0}
  />;
}

{
  // It throws an error when an OwnProps is incorrect.
  // $FlowExpectError
  <ConnectedExampleComponent ownPropString={0} ownPropNumber={0} />;
}

{
  // It throws an error if no OwnProps are provided.
  // $FlowExpectError
  <ConnectedExampleComponent />;
}
