import { useRef, useLayoutEffect, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AgoraRTM from 'agora-rtm-sdk'
import AgoraRTC, {
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  ILocalAudioTrack,
  ILocalVideoTrack,
  IMicrophoneAudioTrack,
  UID
} from 'agora-rtc-react'
import { v4 as uuidV4 } from 'uuid'
import { useDidMount } from '../../hooks/use-did-mount'
import './index.css'

type Member = {
  id: string
  name: string
}

type Message = {
  author: string
  message: string
  isBotMessage?: boolean
}

type Streamer = {
  uid: UID
  height: string
  width: string
}

const STREAM_HEIGHT_WIDTH = {
  height: '300px',
  width: '300px'
}
const STREAM_HEIGHT_WIDTH_WHEN_USER_IN_DISPLAY_FRAME = {
  height: '100px',
  width: '100px'
}

const APP_ID = import.meta.env.VITE_API_ID
const token = null

export const Room = () => {
  const navigate = useNavigate()
  const { roomId } = useParams()
  if (!roomId) navigate('/')

  const displayName = sessionStorage.getItem('displayName') || ''
  if (!displayName) navigate('/')

  let uid = sessionStorage.getItem('uid') || ''
  if (!uid) {
    uid = uuidV4()
    sessionStorage.setItem('uid', uid)
  }

  const rtmClient = AgoraRTM.createInstance(APP_ID)
  const channel = rtmClient.createChannel(roomId!)
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })

  let localTracks: [IMicrophoneAudioTrack, ICameraVideoTrack]
  let localScreenTracks: [ILocalVideoTrack, ILocalAudioTrack]

  const chatContainer = useRef<HTMLElement>(null)
  const messagesContainer = useRef<HTMLDivElement>(null)
  const memberContainer = useRef<HTMLLIElement>(null)

  const [members, setMembers] = useState<Member[]>([])
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [hasJoinedStream, setHasJoinedStream] = useState(false)
  const [streamers, setStreamers] = useState<Streamer[]>([])
  const [userInDisplayFrame, setUserInDisplayFrame] = useState<UID>('')
  const [isSharingScreen, setIsSharingScreen] = useState(false)
  const remoteUsers: { [key: UID]: IAgoraRTCRemoteUser } = {}

  useDidMount(async () => {
    await rtmClient.login({ uid })
    await rtmClient.addOrUpdateLocalUserAttributes({ name: displayName })
    await channel.join()

    channel.on('MemberJoined', handleMemberJoined)
    channel.on('MemberLeft', handleMemberLeft)
    channel.on('ChannelMessage', handleChannelMessage)

    getMembers()
    addBotMessage(`Welcome to the room ${displayName}! 👋`)

    await client.join(APP_ID, roomId!, token, uid)

    client.on('user-published', handleUserPublished)
    client.on('user-left', handleUserLeft)
  })

  useLayoutEffect(() => {
    window.addEventListener('beforeunload', leaveChannel)

    messagesContainer.current!.scrollTop =
      messagesContainer.current!.scrollHeight

    memberContainer.current!.style.display = 'block'
    chatContainer.current!.style.display = 'block'
  }, [])

  useEffect(() => {
    if (userInDisplayFrame) {
      setStreamers((prev) => {
        return prev.map((streamer) => {
          if (streamer.uid !== userInDisplayFrame)
            return {
              uid: streamer.uid,
              ...STREAM_HEIGHT_WIDTH_WHEN_USER_IN_DISPLAY_FRAME
            }

          return streamer
        })
      })
    } else {
      setStreamers((prev) => {
        return prev.map((streamer) => {
          if (streamer.uid !== userInDisplayFrame)
            return {
              uid: streamer.uid,
              ...STREAM_HEIGHT_WIDTH
            }

          return streamer
        })
      })
    }
  }, [userInDisplayFrame])

  useLayoutEffect(() => {
    const lastMessage = document.querySelector(
      '#messages .message__wrapper:last-child'
    )

    if (lastMessage) {
      lastMessage.scrollIntoView()
    }
  }, [messages])

  const handleUserPublished = async (
    user: IAgoraRTCRemoteUser,
    mediaType: 'audio' | 'video'
  ) => {
    remoteUsers[user.uid] = user

    await client.subscribe(user, mediaType)

    addStreamer(user.uid)

    if (mediaType === 'video') {
      user.videoTrack?.play(`user-${user.uid}`)
    }

    if (mediaType === 'audio') {
      user.audioTrack?.play()
    }
  }

  const handleUserLeft = async (user: IAgoraRTCRemoteUser) => {
    removeStreamer(user.uid)
  }

  const handleMemberJoined = async (memberId: string) => {
    console.log('A new member has joined the room:', memberId)
    const { name } = await rtmClient.getUserAttributesByKeys(memberId, ['name'])
    setMembers((prev) => [...prev, { id: memberId, name }])
    addBotMessage(`Welcome to the room ${name}! 👋`)
  }

  const handleMemberLeft = async (memberId: string) => {
    removeMember(memberId)
  }

  const addMember = async (memberId: string) => {
    const { name } = await rtmClient.getUserAttributesByKeys(memberId, ['name'])
    setMembers((prev) => [...prev, { id: memberId, name }])
  }

  const addStreamer = (uid: UID) => {
    const dimensions = userInDisplayFrame
      ? STREAM_HEIGHT_WIDTH_WHEN_USER_IN_DISPLAY_FRAME
      : STREAM_HEIGHT_WIDTH
    setStreamers((prev) => [...prev, { uid, ...dimensions }])
  }

  const addBotMessage = (message: string) => {
    setMessages((prev) => [
      ...prev,
      {
        author: '🤖',
        isBotMessage: true,
        message
      }
    ])
  }

  const removeMember = async (memberId: string) => {
    const member = members.find((member) => member.id === memberId)
    setMembers((current) => current.filter((member) => member.id !== memberId))

    if (member) {
      addBotMessage(`${member.name} has left the room.`)
    }
  }

  const removeStreamer = (uid: UID) => {
    setStreamers((prev) => prev.filter((streamer) => streamer.uid === uid))
    if (userInDisplayFrame === uid) setUserInDisplayFrame('')
  }

  const getMembers = async () => {
    const channelMembers = await channel.getMembers()
    for (const member of channelMembers) {
      addMember(member)
    }
  }

  const handleChannelMessage = async (messageData: any) => {
    console.log('A new message was received')
    const data = JSON.parse(messageData.text)

    if (data.type === 'chat') {
      setMessages((prev) => [
        ...prev,
        { author: data.displayName, message: data.message }
      ])
    }

    if (data.type === 'user_left') {
      removeMember(data.uid)

      if (userInDisplayFrame === data.uid) setUserInDisplayFrame('')
    }
  }

  const sendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    channel.sendMessage({
      text: JSON.stringify({
        type: 'chat',
        message: message,
        displayName: displayName
      })
    })
    setMessages((prev) => [...prev, { author: displayName, message }])
    setMessage('')
  }

  const leaveChannel = async () => {
    await channel.leave()
    await rtmClient.logout()
  }

  const joinStream = async () => {
    setHasJoinedStream(true)

    const localTracks = await AgoraRTC.createMicrophoneAndCameraTracks(
      {},
      {
        encoderConfig: {
          width: { min: 640, ideal: 1920, max: 1920 },
          height: { min: 480, ideal: 1080, max: 1080 }
        }
      }
    )

    addStreamer(uid)

    localTracks[1].play(`user-${uid}`)
    await client.publish([localTracks[0], localTracks[1]])
  }

  const leaveStream = async (e: any) => {
    e.preventDefault()

    setHasJoinedStream(false)

    for (const track of localTracks) {
      track.stop()
      track.close()
    }

    await client.unpublish([localTracks[0], localTracks[1]])

    if (localScreenTracks) {
      await client.unpublish(localScreenTracks)
    }

    removeMember(uid)

    if (userInDisplayFrame === uid) setUserInDisplayFrame('')

    channel.sendMessage({
      text: JSON.stringify({ type: 'user_left', uid: uid })
    })
  }

  const toggleMic = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    let button = e.currentTarget

    if (localTracks[0].muted) {
      await localTracks[0].setMuted(false)
      button.classList.add('active')
    } else {
      await localTracks[0].setMuted(true)
      button.classList.remove('active')
    }
  }

  const toggleCamera = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    let button = e.currentTarget

    if (localTracks[1].muted) {
      await localTracks[1].setMuted(false)
      button.classList.add('active')
    } else {
      await localTracks[1].setMuted(true)
      button.classList.remove('active')
    }
  }

  const toggleScreen = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    let screenButton = e.currentTarget

    if (!isSharingScreen) {
      setIsSharingScreen(true)

      screenButton.classList.add('active')

      setUserInDisplayFrame(uid)

      localScreenTracks = await AgoraRTC.createScreenVideoTrack({}, 'enable')
      localScreenTracks[0].play(`user-${uid}`)

      await client.unpublish([localTracks[1]])
      await client.publish(localScreenTracks)
    } else {
      setIsSharingScreen(false)
      await client.unpublish(localScreenTracks)
      localTracks[1].play(`user-${uid}`)
      await client.publish([localTracks[1]])
    }
  }

  return (
    <main className='container'>
      <div id='room__container'>
        <section id='members__container' ref={memberContainer}>
          <div id='members__header'>
            <p>Participants</p>
            <strong id='members__count'>{members.length}</strong>
          </div>

          <div id='member__list'>
            {members.map((member) => (
              <div
                className='member__wrapper'
                id={`member__${member.id}__wrapper`}
              >
                <span className='green__icon'></span>
                <p className='member_name'>{member.name}</p>
              </div>
            ))}
          </div>
        </section>

        <section id='stream__container'>
          <div
            id='stream__box'
            style={{ display: userInDisplayFrame ? 'block' : 'none' }}
            onClick={() => setUserInDisplayFrame('')}
          >
            {streamers.map(
              (streamer) =>
                streamer.uid === userInDisplayFrame && (
                  <div
                    className='video__container'
                    id={`user-container-${streamer.uid}`}
                    style={{ height: streamer.height, width: streamer.width }}
                  >
                    <div
                      className='video-player'
                      id={`user-${streamer.uid}`}
                    ></div>
                  </div>
                )
            )}
          </div>

          <div id='streams__container'>
            {streamers.map(
              (streamer) =>
                streamer.uid !== userInDisplayFrame && (
                  <div
                    className='video__container'
                    id={`user-container-${streamer.uid}`}
                    style={{ height: streamer.height, width: streamer.width }}
                    onClick={() => setUserInDisplayFrame(streamer.uid)}
                  >
                    <div
                      className='video-player'
                      id={`user-${streamer.uid}`}
                    ></div>
                  </div>
                )
            )}
          </div>

          <div
            className='stream__actions'
            style={{ display: hasJoinedStream ? 'flex' : 'none' }}
          >
            <button
              id='camera-btn'
              className={isSharingScreen ? '' : 'active'}
              style={{ display: isSharingScreen ? 'none' : 'block' }}
              onClick={toggleCamera}
            >
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='24'
                height='24'
                viewBox='0 0 24 24'
              >
                <path d='M5 4h-3v-1h3v1zm10.93 0l.812 1.219c.743 1.115 1.987 1.781 3.328 1.781h1.93v13h-20v-13h3.93c1.341 0 2.585-.666 3.328-1.781l.812-1.219h5.86zm1.07-2h-8l-1.406 2.109c-.371.557-.995.891-1.664.891h-5.93v17h24v-17h-3.93c-.669 0-1.293-.334-1.664-.891l-1.406-2.109zm-11 8c0-.552-.447-1-1-1s-1 .448-1 1 .447 1 1 1 1-.448 1-1zm7 0c1.654 0 3 1.346 3 3s-1.346 3-3 3-3-1.346-3-3 1.346-3 3-3zm0-2c-2.761 0-5 2.239-5 5s2.239 5 5 5 5-2.239 5-5-2.239-5-5-5z' />
              </svg>
            </button>
            <button id='mic-btn' className='active' onClick={toggleMic}>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='24'
                height='24'
                viewBox='0 0 24 24'
              >
                <path d='M12 2c1.103 0 2 .897 2 2v7c0 1.103-.897 2-2 2s-2-.897-2-2v-7c0-1.103.897-2 2-2zm0-2c-2.209 0-4 1.791-4 4v7c0 2.209 1.791 4 4 4s4-1.791 4-4v-7c0-2.209-1.791-4-4-4zm8 9v2c0 4.418-3.582 8-8 8s-8-3.582-8-8v-2h2v2c0 3.309 2.691 6 6 6s6-2.691 6-6v-2h2zm-7 13v-2h-2v2h-4v2h10v-2h-4z' />
              </svg>
            </button>
            <button id='screen-btn' onClick={toggleScreen}>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='24'
                height='24'
                viewBox='0 0 24 24'
              >
                <path d='M0 1v17h24v-17h-24zm22 15h-20v-13h20v13zm-6.599 4l2.599 3h-12l2.599-3h6.802z' />
              </svg>
            </button>
            <button id='leave-btn' style={{ backgroundColor: '#FF5050' }}>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='24'
                height='24'
                viewBox='0 0 24 24'
              >
                <path d='M16 10v-5l8 7-8 7v-5h-8v-4h8zm-16-8v20h14v-2h-12v-16h12v-2h-14z' />
              </svg>
            </button>
          </div>

          <button
            id='join-btn'
            onClick={joinStream}
            style={{ display: hasJoinedStream ? 'none' : 'block' }}
          >
            Join Stream
          </button>
        </section>

        <section id='messages__container' ref={chatContainer}>
          <div id='messages' ref={messagesContainer}>
            {messages.map((item) => (
              <div className='message__wrapper'>
                <div
                  className={`message__body${item.isBotMessage ? '__bot' : ''}`}
                >
                  <strong
                    className={`message__author${
                      item.isBotMessage ? '__bot' : ''
                    }`}
                  >
                    {item.author}
                  </strong>
                  <p
                    className={`message__text${
                      item.isBotMessage ? '__bot' : ''
                    }`}
                  >
                    {item.message}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <form id='message__form' onSubmit={sendMessage}>
            <input
              type='text'
              name='message'
              placeholder='Send a message....'
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </form>
        </section>
      </div>
    </main>
  )
}
