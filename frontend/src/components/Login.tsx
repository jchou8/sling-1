import React, { Component, FormEvent, Dispatch } from 'react';
import { connect } from 'react-redux'
import axios, { AxiosResponse } from 'axios'
import {
    Container,
    TextField,
    Button
} from '@material-ui/core'
import { User } from '../types'
import { logIn } from '../actions'
import { AppActionTypes } from '../actions/types'

const initialState = {
    login: true,
    username: '',
    password: '',
    email: '',
    error: '',
    loading: false
}
type LoginState = {
    login: boolean,
    username: string,
    password: string,
    email: string,
    error: string,
    loading: boolean
}

type OwnProps = {
    setLoggedIn: Function
}

const mapDispatchToProps = (dispatch: Dispatch<AppActionTypes>, ownProps: OwnProps) => {
    return {
        onLogIn: (user: User) => {
            dispatch(logIn(user))
        },
        setLoggedIn: ownProps.setLoggedIn
    }
}
type Props = ReturnType<typeof mapDispatchToProps>

class Login extends Component<Props, LoginState> {
    readonly state: LoginState = initialState

    handleChange(value: string, field: string) {
        this.setState(prevState => ({
            ...prevState,
            [field]: value
        }))
    }

    handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!this.validateInfo()) {
            return
        }

        this.setState({ error: '', loading: true })
        if (this.state.login) {
            this.tryLogin()
        } else {
            this.tryRegister()
        }
    }

    validateInfo(): boolean {
        if (this.state.username.length <= 0) {
            this.setState({ error: 'No username provided.' })
            return false
        }

        if (!this.state.login && this.state.email.length <= 0) {
            this.setState({ error: 'No email provided.' })
            return false
        }

        if (this.state.password.length <= 0) {
            this.setState({ error: 'No password provided.' })
            return false
        }

        return true
    }

    toggleLogin() {
        this.setState({ login: !this.state.login })
    }

    tryLogin() {
        axios.post("api/login", {
            name: this.state.username,
            password: this.state.password
        }).then((res: AxiosResponse) => {
            this.handleLogIn(res.data)
        }).catch((err) => {
            console.log(err)
            this.setState({ error: 'Invalid username or password.', password: '' })
        }).finally(() => {
            this.setState({ loading: false })
        })
    }

    tryRegister() {
        axios.post("api/register", {
            name: this.state.username,
            email: this.state.email,
            password: this.state.password
        }).then((res: AxiosResponse) => {
            this.handleLogIn(res.data)
        }).catch((err) => {
            console.log(err)
            this.setState({ error: 'Invalid credentials.' })
        }).finally(() => {
            this.setState({ loading: false })
        })
    }

    handleLogIn(data: AxiosResponse['data']) {
        localStorage.setItem('jwt_token', data.jwt_token)
        let user: User = {
            id: data.id,
            username: data.name,
            jwtToken: data.jwt_token
        }
        this.props.onLogIn(user)
        this.props.setLoggedIn()
    }

    render() {
        return (
            <Container maxWidth="sm">
                <h1>{this.state.login ? 'Login' : 'Register'}</h1>

                <div>
                    {this.state.login ? 'Need an account? ' : 'Already have an account? '}
                    <Button
                        disabled={this.state.loading}
                        variant='contained'
                        onClick={() => this.toggleLogin()}
                    >
                        {this.state.login ? 'Register' : 'Login'}
                    </Button>
                </div>

                <br />

                <form onSubmit={(e) => this.handleSubmit(e)}>
                    <div>
                        <TextField
                            disabled={this.state.loading}
                            id='username'
                            label='Username'
                            value={this.state.username}
                            onChange={e => this.handleChange(e.currentTarget.value, 'username')}
                        />
                    </div>

                    {!this.state.login &&
                        <div>
                            <TextField
                                disabled={this.state.loading}
                                id='email'
                                label='Email'
                                value={this.state.email}
                                onChange={e => this.handleChange(e.currentTarget.value, 'email')}
                            />
                        </div>
                    }

                    <div>
                        <TextField
                            disabled={this.state.loading}
                            id='password'
                            label='Password'
                            type='password'
                            value={this.state.password}
                            onChange={e => this.handleChange(e.currentTarget.value, 'password')}
                        />
                    </div>

                    <br />

                    <div style={{ color: 'red' }}>{this.state.error}</div>

                    <br />

                    <Button
                        disabled={this.state.loading}
                        variant='contained'
                        color='primary'
                        type='submit'
                        value='Submit'
                    >
                        Submit
                    </Button>
                </form>
            </Container>
        )
    }
}


export default connect(null, mapDispatchToProps)(Login)