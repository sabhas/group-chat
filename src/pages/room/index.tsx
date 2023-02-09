import { useRef, useLayoutEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AgoraRTM from 'agora-rtm-sdk'
import AgoraRTC from 'agora-rtc-react'
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

const APP_ID = import.meta.env.VITE_API_ID
const token = null

export const Room = () => {
  const navigate = useNavigate()
  const { roomId } = useParams()
  if (!roomId) navigate('/')

  const displayName = sessionStorage.getItem('displayName') || ''
  if (!displayName) navigate('/')

  const rtmClient = AgoraRTM.createInstance(APP_ID)
  const channel = rtmClient.createChannel(roomId!)
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })

  const chatContainer = useRef<HTMLElement>(null)
  const messagesContainer = useRef<HTMLDivElement>(null)
  const memberContainer = useRef<HTMLLIElement>(null)
  const displayFrame = useRef<HTMLDivElement>(null)

  const [members, setMembers] = useState<Member[]>([])
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])

  useDidMount(async () => {
    let uid = sessionStorage.getItem('uid')
    if (!uid) {
      uid = uuidV4()
      sessionStorage.setItem('uid', uid)
    }

    await rtmClient.login({ uid })
    await rtmClient.addOrUpdateLocalUserAttributes({ name: displayName })
    await channel.join()

    channel.on('MemberJoined', handleMemberJoined)
    channel.on('MemberLeft', handleMemberLeft)
    channel.on('ChannelMessage', handleChannelMessage)

    getMembers()
    addBotMessage(`Welcome to the room ${displayName}! 👋`)

    await client.join(APP_ID, roomId!, token, uid)

    // client.on('user-published', handleUserPublished)
    // client.on('user-left', handleUserLeft)
  })

  useLayoutEffect(() => {
    window.addEventListener('beforeunload', leaveChannel)

    messagesContainer.current!.scrollTop =
      messagesContainer.current!.scrollHeight

    memberContainer.current!.style.display = 'block'
    chatContainer.current!.style.display = 'block'
  }, [])

  useLayoutEffect(() => {
    const lastMessage = document.querySelector(
      '#messages .message__wrapper:last-child'
    )

    if (lastMessage) {
      lastMessage.scrollIntoView()
    }
  }, [messages])

  let userIdInDisplayFrame = ''

  const videoFrames = document.getElementsByClassName(
    'video__container'
  ) as HTMLCollectionOf<HTMLElement>

  const expandVideoFrame = (e: Event) => {
    const child = displayFrame.current!.children[0]
    const streamContainer = document.getElementById('streams_container')
    if (streamContainer) streamContainer.appendChild(child)

    displayFrame.current!.style.display = 'block'
    const target = e.target as HTMLElement
    displayFrame.current!.appendChild(target)
    userIdInDisplayFrame = target.id

    for (const frame of videoFrames) {
      if (frame.id !== userIdInDisplayFrame) {
        frame.style.height = '100px'
        frame.style.width = '100px'
      }
    }
  }

  const hideDisplayFrame = () => {
    userIdInDisplayFrame = ''
    displayFrame.current!.style.display = 'none'

    const child = displayFrame.current!.children[0]
    const streamContainer = document.getElementById('streams_container')
    if (streamContainer) streamContainer.appendChild(child)

    for (const frame of videoFrames) {
      frame.style.height = '300px'
      frame.style.width = '300px'
    }
  }

  for (const frame of videoFrames) {
    frame.addEventListener('click', expandVideoFrame)
  }

  const handleMemberJoined = async (memberId: string) => {
    console.log('A new member has joined the room:', memberId)
    const { name } = await rtmClient.getUserAttributesByKeys(memberId, ['name'])
    setMembers((prev) => [...prev, { id: memberId, name }])
    addBotMessage(`Welcome to the room ${name}! 👋`)
  }

  const addMember = async (memberId: string) => {
    const { name } = await rtmClient.getUserAttributesByKeys(memberId, ['name'])
    setMembers((prev) => [...prev, { id: memberId, name }])
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

  const handleMemberLeft = async (memberId: string) => {
    removeMember(memberId)
  }

  const removeMember = async (memberId: string) => {
    const member = members.find((member) => member.id === memberId)
    setMembers((current) => current.filter((member) => member.id !== memberId))

    if (member) {
      addBotMessage(`${member.name} has left the room.`)
    }
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

      if (userIdInDisplayFrame === `user-container-${data.uid}`) {
        displayFrame.current!.style.display = 'none'
        for (let i = 0; videoFrames.length > i; i++) {
          videoFrames[i].style.height = '300px'
          videoFrames[i].style.width = '300px'
        }
      }
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
            ref={displayFrame}
            onClick={hideDisplayFrame}
          ></div>

          <div id='streams__container'></div>

          <div className='stream__actions'>
            <button id='camera-btn' className='active'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='24'
                height='24'
                viewBox='0 0 24 24'
              >
                <path d='M5 4h-3v-1h3v1zm10.93 0l.812 1.219c.743 1.115 1.987 1.781 3.328 1.781h1.93v13h-20v-13h3.93c1.341 0 2.585-.666 3.328-1.781l.812-1.219h5.86zm1.07-2h-8l-1.406 2.109c-.371.557-.995.891-1.664.891h-5.93v17h24v-17h-3.93c-.669 0-1.293-.334-1.664-.891l-1.406-2.109zm-11 8c0-.552-.447-1-1-1s-1 .448-1 1 .447 1 1 1 1-.448 1-1zm7 0c1.654 0 3 1.346 3 3s-1.346 3-3 3-3-1.346-3-3 1.346-3 3-3zm0-2c-2.761 0-5 2.239-5 5s2.239 5 5 5 5-2.239 5-5-2.239-5-5-5z' />
              </svg>
            </button>
            <button id='mic-btn' className='active'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                width='24'
                height='24'
                viewBox='0 0 24 24'
              >
                <path d='M12 2c1.103 0 2 .897 2 2v7c0 1.103-.897 2-2 2s-2-.897-2-2v-7c0-1.103.897-2 2-2zm0-2c-2.209 0-4 1.791-4 4v7c0 2.209 1.791 4 4 4s4-1.791 4-4v-7c0-2.209-1.791-4-4-4zm8 9v2c0 4.418-3.582 8-8 8s-8-3.582-8-8v-2h2v2c0 3.309 2.691 6 6 6s6-2.691 6-6v-2h2zm-7 13v-2h-2v2h-4v2h10v-2h-4z' />
              </svg>
            </button>
            <button id='screen-btn'>
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

          <button id='join-btn'>Join Stream</button>
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
