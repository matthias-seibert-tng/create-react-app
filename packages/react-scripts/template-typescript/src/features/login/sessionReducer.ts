// Note: This is an adapter from the new OAuth user profile to the old
// structure the "whoami" call produced with the caveat that no roles
// are being provided since these will be removed with IAM2.1.
// If you don't need this backport it is strongly encouraged to remove
// it and use the profile information directly.

import { LoginActionTypes, SessionState, USER_PROFILE_OBTAINED } from './types';

const initialState: SessionState = {
    errorMessage: '',
    hasUserInfo: false,
    isLoggedIn: false,
    showError: false,
    userInfo: null,
};

export default function sessionReducer(state: SessionState = initialState, action: LoginActionTypes): SessionState {
    switch (action.type) {
        case USER_PROFILE_OBTAINED: {
            const profile = action.payload;
            return {
                ...state,
                hasUserInfo: true,
                isLoggedIn: true,
                userInfo: {
                    email: profile.email,
                    firstName: profile.givenName,
                    lastName: profile.familyName,
                    roles: [],
                },
            };
        }
        default:
            return state;
    }
}
