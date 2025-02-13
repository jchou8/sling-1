import * as React from 'react';
import { connect } from 'react-redux'
import axios, { AxiosResponse } from 'axios'

import './MessagePage.css';
import SideBar from './components/SideBar';
import DisplayWindow from './components/DisplayWindow';
import InputBox from './components/InputBox';

import { AppState } from './store'
import { User, Room, Message } from './types'
import { dispatchActions } from './store/dispatch'

type MessagePageState = {
    inputEnabled: boolean
    error: string
    loading: boolean
    connectedToMsgSocket: boolean
    connectedToActSocket: boolean
}

const initialState: MessagePageState = {
    inputEnabled: true, // don't enable until messages successfully fetched
    error: '',
    loading: true,
    connectedToMsgSocket: false,
    connectedToActSocket: false,
}

type OwnProps = {
    setLoggedOut: Function
}

const mapStateToProps = (state: AppState, ownProps: OwnProps) => ({ ...state, ...ownProps })
type Props = ReturnType<typeof mapStateToProps> & ReturnType<typeof dispatchActions>

class MessagePage extends React.Component<Props, MessagePageState> {
    private msgWebsocket!: WebSocket
    private actWebsocket!: WebSocket
    readonly state: MessagePageState = initialState
    private messagesEnd = React.createRef<HTMLDivElement>()

    componentDidMount() {
        let token = localStorage.getItem('jwt_token')
        if (!token || token.length === 0) {
            this.handleLogOut()
        }

        // Get current user from token
        let curUserPromise = axios.get('api/users/current', {
            headers: { 'Token': token }
        }).then((res: AxiosResponse) => {
            let user: User = {
                id: res.data.id,
                username: res.data.name,
                jwtToken: res.data.jwt_token
            }
            this.props.onLogIn(user)
        })

        // Fetch users
        let usersPromise = axios.get('api/users/', {
            headers: {
                'Token': token
            }
        }).then((res: AxiosResponse) => {
            this.props.onLoadUsers(res.data.map((user: any): User => ({
                username: user.name,
                id: user.id,
                jwtToken: null // can't get other peoples' tokens
            })))
        })

        // Fetch rooms
        let roomsPromise = axios.get('api/rooms', {
            headers: {
                'Token': token
            }
        }).then((res: AxiosResponse) => {
            this.props.onLoadRooms(res.data.map((room: any): Room => ({
                id: room.id,
                name: room.name,
                hasJoined: room.hasJoined,
                hasNotification: room.hasNotification,
                isDM: room.type === 1
            })))
        })

        Promise.all([curUserPromise, usersPromise, roomsPromise]).catch((err) => {
            console.log(err)

            // Force user back to login page
            this.handleLogOut()
        }).finally(() => {
            console.log(this.state)
            this.setState({ loading: false })
            // // Set up websocket handlers
            this.msgWebsocket = new WebSocket("ws://localhost:8888/api/stream/messages")
            this.actWebsocket = new WebSocket("ws://localhost:8888/api/stream/actions")

            this.msgWebsocket.onopen = this.handleMsgWebsocketOpen
            this.msgWebsocket.onclose = this.handleMsgWebsocketClose
            this.msgWebsocket.onmessage = this.handleMsgWebsocketMessage
            this.msgWebsocket.onerror = this.handleMsgWebsocketError
            this.actWebsocket.onopen = this.handleActWebsocketOpen
            this.actWebsocket.onclose = this.handleActWebsocketClose
            this.actWebsocket.onerror = this.handleActWebsocketError
            this.actWebsocket.onmessage = this.handleActWebsocketMessage
        })
    }

    componentWillUnmount() {
        if (this.actWebsocket) {
            this.actWebsocket.close()
        }

        if (this.msgWebsocket) {
            this.msgWebsocket.close()
        }
        console.log('component unmounting, closed websockets')
    }

    handleLogOut() {
        this.props.onLogOut()
        this.props.setLoggedOut()
    }

    handleMsgWebsocketOpen = (ev: Event) => {
        if (this.props.curUser != null) {
            var token = this.props.curUser.jwtToken
            this.msgWebsocket.send(JSON.stringify({ jwt_token: token }));
        }
        else {
            console.log("curUser is null")
        }
        this.setState({ connectedToMsgSocket: true, });
    }

    handleMsgWebsocketClose = (ev: CloseEvent) => {
        this.setState({ connectedToMsgSocket: false, });
        alert("Server has Disconnected")
    }

    handleMsgWebsocketMessage = (mev: MessageEvent) => {
        const msgResponsePayload = JSON.parse(mev.data);
        console.log(msgResponsePayload);
        if (msgResponsePayload.messageType === "new_message") {
            if (msgResponsePayload.body === null) {
                console.log("invalid message body received - null")
                return
            }
            this.props.onNewMessage({
                msgID: msgResponsePayload.userID, // TODO make a real messageID
                userID: msgResponsePayload.userID,
                username: msgResponsePayload.userName,
                time: new Date(msgResponsePayload.time),
                body: msgResponsePayload.body,
            });
            this.scrollToBottom();
        } else if (msgResponsePayload.messageType === "notification") {
            this.props.onMarkUnread(msgResponsePayload.roomID);
        } else {
            console.log("undefined type")
        }
    }

    handleMsgWebsocketError = (ev: Event) => {
        this.setState({ error: "encountered message websocket error" + ev })
    }

    handleActWebsocketOpen = (ev: Event) => {
        if (this.props.curUser != null) {
            var token = this.props.curUser.jwtToken
            this.actWebsocket.send(JSON.stringify({ jwt_token: token }));
        }
        else {
            console.log("curUser is null")
        }
        this.setState({ connectedToActSocket: true, });
    }

    handleActWebsocketClose = (ev: CloseEvent) => {
        this.setState({ connectedToActSocket: false, });
        alert("Server has disconnected")
    }

    handleActWebsocketError = (ev: Event) => {
        this.setState({ error: "encountered action websocket error" + ev })
    }

    handleActWebsocketMessage = (mev: MessageEvent) => {
        const actResponsePayload = JSON.parse(mev.data);
        console.log(actResponsePayload);
        if (actResponsePayload.actionType === "message_history") {
            if (actResponsePayload.messageHistory === null) {
                console.log("invalid message history recieved")
                return
            }
            const msgs = actResponsePayload.messageHistory;
            let messages = [];
            for (let i = 0; i < msgs.length; i++) {
                messages.push({
                    msgID: msgs[i].id,
                    userID: msgs[i].userID,
                    username: msgs[i].userName,
                    time: new Date(msgs[i].time), //
                    body: msgs[i].body
                })
                console.log(`reading time as ${msgs[i].time}`)
            }
            messages.sort((a, b) => a.time > b.time ? 1 : -1)
            this.props.onLoadMessages(messages);
            this.scrollToBottom();
        } else if (actResponsePayload.actionType === "create_dm") {
            if (actResponsePayload.roomName === null) {
                console.log("invalid roomName received")
                return
            }
            let newRoom = {
                id: actResponsePayload.roomID,
                name: actResponsePayload.roomName,
                hasJoined: true,
                hasNotification: false,
                isDM: true,
            }
            this.props.onNewRoom(newRoom)
            if (this.props.curUser !== null && actResponsePayload.userID === this.props.curUser.id) {
                this.props.onChangeRoom(newRoom)
            }
        } else if (actResponsePayload.actionType === "new_user") {
            if (actResponsePayload.userID === null) {
                console.log("invalid userID received")
                return
            }
            this.props.onNewUser({
                username: actResponsePayload.userName,
                id: actResponsePayload.userID,
                jwtToken: ""
            })
        } else if (actResponsePayload.actionType === "new_room") {
            if (actResponsePayload.roomName === null) {
                console.log("invalid userID received")
                return
            }

            this.props.onNewRoom({
                id: actResponsePayload.roomID,
                name: actResponsePayload.roomName,
                hasJoined: actResponsePayload.userID === this.props.curUser!.id,
                hasNotification: false,
                isDM: false,
            })
        } else {
            console.log("undefined type");
        }

    }

    sendMessage(body: String) {
        console.log(`sending ${body}`)
        if (body.trim().length <= 0) {
            return
        }

        if (this.props.curRoom == null || this.props.curRoom.id === null ||
            this.props.curUser === null || this.props.curUser.id === null) {
            console.log("invalid message sent, with null input")
            return
        }
        var messagePayload = {
            messageType: "message",
            userID: this.props.curUser.id,
            roomID: this.props.curRoom.id,
            time: (new Date()),
            body: body,
        }

        this.msgWebsocket.send(JSON.stringify(messagePayload))
    }

    changeRoom(nextRoom: Room) {
        console.log("room changed")
        if (this.props.curUser === null) {
            console.log("change room failed- something is null")
            console.log(this.props.curRoom, this.props.curUser)
            return
        }

        let curRoomID = 0
        if (this.props.curRoom) {
            if (nextRoom.id === this.props.curRoom.id) {
                return
            }
            curRoomID = this.props.curRoom.id
        }

        var actionPayload = {
            actionType: "change_room",
            userID: this.props.curUser.id,
            roomID: curRoomID,
            newRoomID: nextRoom.id,
            dmUserID: 0,
            newRoomName: ""
        }

        this.props.onChangeRoom(nextRoom)
        console.log("room changed - not null")
        this.actWebsocket.send(JSON.stringify(actionPayload))
    }

    createRoom(name: string) {
        console.log(`trying to create room ${name}`)

        if (this.props.curUser === null) {
            console.log("curUser is null")
            return
        }

        let actionPayload = {
            actionType: "create_room",
            userID: this.props.curUser.id,
            roomID: 0,
            newRoomID: 0,
            dmUserID: 0,
            newRoomName: name
        }

        this.actWebsocket.send(JSON.stringify(actionPayload))
    }

    startDM(user: User) {
        console.log("creating direct message room: ", user)

        if (this.props.curUser === null) {
            console.log("curUser is null")
            return
        }
        if (user.id === null) {
            console.log("target user id is null")
            return
        }

        var actionPayload = {
            actionType: "create_dm",
            userID: this.props.curUser.id,
            roomID: this.props.curRoom ? this.props.curRoom.id : 0,
            newRoomID: 0,
            dmUserID: user.id,
            newRoomName: ""
        }

        this.actWebsocket.send(JSON.stringify(actionPayload))
    }

    joinRoom(nextRoom: Room) {
        if (nextRoom.hasJoined) {
            return
        }

        if (this.props.curUser === null) {
            console.log("curUser is null")
            return
        }
        let curRoomID = 0
        if (this.props.curRoom) {
            if (nextRoom.id === this.props.curRoom.id) {
                return
            }
            curRoomID = this.props.curRoom.id
        }

        var actionPayload = {
            actionType: "join_room",
            userID: this.props.curUser.id,
            roomID: curRoomID,
            newRoomID: nextRoom.id,
            dmUserID: 0,
            newRoomName: ""
        }
        console.log("room joined - not null")
        this.actWebsocket.send(JSON.stringify(actionPayload))

        this.props.onJoinRoom(nextRoom)
    }

    scrollToBottom = () => {
        this.messagesEnd.current!.scrollIntoView({ behavior: "smooth" });
    }

    render() {
        return (
            <div className="App">
                <div className="left-div">
                    <SideBar
                        curUser={this.props.curUser!}
                        curRoom={this.props.curRoom}
                        rooms={this.props.rooms}
                        users={this.props.users}

                        logOut={() => {
                            this.handleLogOut()
                            this.actWebsocket.close()
                            this.msgWebsocket.close()
                            console.log('logging out, closed websockets')
                        }}

                        createRoom={(name: string) => this.createRoom(name)}
                        changeRoom={(room: Room) => this.changeRoom(room)}
                        joinRoom={(room: Room) => this.joinRoom(room)}
                        startDM={(user: User) => this.startDM(user)}
                    />
                </div>
                <div className="right-div">
                    <div className="messages">
                        <DisplayWindow
                            curRoom={this.props.curRoom!}
                            messages={this.props.messages}
                        />
                        <div style={{ float: "left", clear: "both" }} ref={this.messagesEnd}></div>
                    </div>
                    <div className="inputs">
                        <InputBox
                            sendMessage={(body: String) => this.sendMessage(body)}
                            enabled={this.props.curRoom !== null}
                        />
                    </div>
                </div>
            </div>
        );
    }
}

export default connect(mapStateToProps, dispatchActions)(MessagePage);
