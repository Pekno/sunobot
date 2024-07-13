import { REST, Routes, Client, GatewayIntentBits } from 'discord.js';
import { entersState, joinVoiceChannel, VoiceConnectionStatus, createAudioResource, createAudioPlayer, getVoiceConnection, AudioPlayerStatus } from '@discordjs/voice';
import { CONFIG } from '../config/config.js';
import { LANG_MAP } from '../config/langMap.js';
import langdetect from 'langdetect';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import he from 'he';

const IS_DEBUG = true;
const audioPlayer = createAudioPlayer();
var audioQueue = {
    _queue: [],
    isEmpty: function () {
        return !this._queue.length
    },
    add: function (e) {
        this._queue.push(e)
    },
    consume: function () {
        const res = this._queue[0]
        this._queue.shift()
        return res;
    },
    clear: function () {
        this._queue = []
    },
    play: function () {
        if (audioPlayer.state.status !== AudioPlayerStatus.Playing) {
            const resource = createAudioResource(audioQueue.consume());
            audioPlayer.play(resource);
        }
    }
}
const SUNO_DATA_PATH = "./suno/data.json";
var sunoDictionnary;
var currentChannel;

if (!fs.existsSync(SUNO_DATA_PATH)) {
    fs.writeFileSync(SUNO_DATA_PATH, JSON.stringify({}))
    console.log(`File '${SUNO_DATA_PATH}' created.`);
} 

audioPlayer.on(AudioPlayerStatus.Idle, () => {
    console.log("IDLE")
    console.log(audioQueue)
    let voiceConnection = getVoiceConnection(currentChannel.guild.id);
    if (!audioQueue.isEmpty()) {
        console.log("Still element on Queue, reading...")
        const resource = createAudioResource(audioQueue.consume());
        audioPlayer.play(resource);
    } else {
        voiceConnection.destroy()
    }
});

audioPlayer.on(AudioPlayerStatus.Paused, () => {
    console.log("PAUSE")
})

audioPlayer.on(AudioPlayerStatus.AutoPaused, () => {
    console.log("AUTO-PAUSE")
})

audioPlayer.on(AudioPlayerStatus.Buffering, () => {
    console.log("BUFFER")
})

audioPlayer.on(AudioPlayerStatus.Playing, () => {
    console.log("PLAYING")
})

audioPlayer.on('error', (e) => {
    console.log("ERROR - " + e)
})

const Commands = {
    'suno_search': {
        description: 'Search a (local) Suno music',
        options: [
            {
                type: 3,
                name: "filter",
                description: "search text",
                required: false,
            }
        ],
        execute: async (interaction) => {
            if (IS_DEBUG) { console.log(`Displaying all already played songs`) }
            await respondSunoList(interaction, interaction.options.getString('filter'))
        }
    },
    'suno': {
        description: 'Play a suno music',
        options: [
            {
                type: 3,
                name: "url",
                description: "suno url",
                required: true
            }
        ],
        execute: async (interaction) => {
            currentChannel = interaction.member.voice.channel;
            joinVoiceChan(currentChannel)
            if (IS_DEBUG) { console.log(`Trying to get ${interaction.options.getString('url')}`) }
            await playSuno(interaction)
        }
    },
    'read': {
        description: 'Read a reddit thread',
        options: [
            {
                type: 3,
                name: "url",
                description: "reddit url",
                required: true
            }
        ],
        execute: async (interaction) => {
            currentChannel = interaction.member.voice.channel;
            joinVoiceChan(currentChannel)
            if (IS_DEBUG) { console.log(`Trying to read ${interaction.options.getString('url')}`) }
            await readReddit(interaction)
        }
    },
    'skip': {
        description: 'Skip a sound',
        execute: async (interaction) => {
            audioPlayer.stop()
            interaction.reply("Skipped")
        }
    },
    'pause': {
        description: 'Pause sound',
        execute: async (interaction) => {
            audioPlayer.pause()
            interaction.reply("Pause")
        }
    },
    'resume': {
        description: 'Resume sound',
        execute: async (interaction) => {
            audioPlayer.unpause()
            interaction.reply("Unpause")
        }
    },
    'stop': {
        description: 'Stop sound',
        execute: async (interaction) => {
            audioPlayer.stop()
            audioQueue.clear()
            interaction.reply("Stop")
        }
    },
};

let transformedCommands = Object.entries(Commands).map(([key, value]) => {
    return { name: key, description: value.description, options: value.options };
})
if(!CONFIG.GOOGLE_TTS_API_KEY){
    transformedCommands = transformedCommands.filter(e => e.name !== 'read')
}

const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_TOKEN);

try {
    console.log('Started refreshing application (/) with these commands :');
    console.log(transformedCommands)
    await rest.put(Routes.applicationCommands(CONFIG.DISCORD_ID), { body: transformedCommands });
    console.log('Successfully reloaded application (/) commands.');
} catch (error) {
    console.error(error);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag} !`);
    const data = fs.readFileSync(SUNO_DATA_PATH);
    sunoDictionnary = JSON.parse(data)
    console.log(`Finished reading suno data file`)
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try{
        if (Commands[interaction.commandName]) {
            await Commands[interaction.commandName].execute(interaction);
        } else {
            await interaction.reply('Command not found !');
        }
    }catch(e){
        await interaction.reply(e);
    }

});

client.login(CONFIG.DISCORD_TOKEN);

// UTILS 

const joinVoiceChan = (channel) => {
    console.log("Joining Voice Channel")
    let voiceConnection = getVoiceConnection(channel.guild.id);
    if (voiceConnection?.state?.status == VoiceConnectionStatus.Ready) return;
    if (voiceConnection) {
        voiceConnection.destroy();
        voiceConnection = null;
    }
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });
    voiceConnection = connection
    connection.on(VoiceConnectionStatus.Ready, (err) => {
        voiceConnection.subscribe(audioPlayer);
    });
    connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
        try {
            console.log("Problems with connection")
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch (error) {
            console.log(error)
            connection.destroy();
        }
    });
}

const generateFileName = () => {
    var now = new Date();
    return now.toISOString().replace(/[.:]/g, '');
};

const generateMessage = (index, message, filename) => {
    return new Promise((resolve, reject) => {

        const lang = langdetect.detectOne(message);
        const languageCode = LANG_MAP[lang]

        const request = {
            input: { text: message },
            voice: {
                "languageCode": languageCode,
                "ssmlGender": ["MALE", "FEMALE"][Math.floor(Math.random() * 2)]
            },
            audioConfig: { audioEncoding: 'MP3' },
        };

        axios
            .post(
                `https://texttospeech.googleapis.com/v1/text:synthesize?key=${CONFIG.GOOGLE_TTS_API_KEY}`,
                request
            ).then(response => {
                const audioContent = response.data.audioContent;
                const audioFilename = `${filename}/${index}_${generateFileName()}.mp3`;
                fs.writeFileSync(audioFilename, audioContent, 'base64');
                resolve(audioFilename)
            }).catch(e => {
                reject(e)
            })
    })
};

const extractRedditThreadInfo = (url) => {
    const redditThreadRegex = /^https:\/\/www\.reddit\.com\/r\/([^\/]+)\/comments\/([a-z0-9]+)\/[^\/]+\/?$/i;
    const match = url.match(redditThreadRegex);

    if (match) {
        return {
            subreddit: match[1],
            threadId: match[2]
        };
    } else {
        return null;
    }
}

const splitStringIntoChunks = (str, chunkSize = 999999999) => {
    let chunks = [];
    for (let i = 0; i < str.length; i += chunkSize) {
        chunks.push(str.slice(i, i + chunkSize));
    }
    return chunks;
}

const getSunoSongData = async (songId) => {
    const response = await axios.get(`https://suno.com/song/${songId}`)
    const reTitles = /<meta\s+property="og:title"\s+content="([^"]+)"\s*\/?>/;
    const match = response.data.match(reTitles)
    if (!match) return songId
    const cleanedString = he.unescape(match[1]).replace(' | Suno', '')
    const splitString = cleanedString.split(' by @')
    return {
        title: splitString[0],
        author: splitString[1]
    }
}

const extractSunoInfo = (url) => {
    const sunoThreadRegex = /^https:\/\/suno\.com\/song\/(([a-z0-9]+|-)+)/i;
    const match = url.match(sunoThreadRegex);

    if (match) {
        return {
            sunoId: match[1]
        };
    } else {
        return null;
    }
}

const playSuno = async (interaction) => {
    const cleanedSunoUrl = interaction.options.getString('url').replace(/\/$/, "");
    const dataExtract = extractSunoInfo(cleanedSunoUrl)
    if (!dataExtract) throw "Not a suno URL";

    const filename = `./suno/${dataExtract.sunoId}.mp3`;
    if (!fs.existsSync(filename)) {

        const sunoMp3Url = `https://cdn1.suno.ai/${dataExtract.sunoId}.mp3`
        console.log(`Fetching data from ${sunoMp3Url}`)

        const result = await axios.request({
            responseType: 'arraybuffer',
            url: sunoMp3Url,
            method: 'get',
            headers: {
                'Content-Type': 'audio/mp3',
            },
        });
        fs.writeFileSync(filename, result.data);
    }

    const songData = await getSunoSongData(dataExtract.sunoId)

    if(!sunoDictionnary[dataExtract.sunoId]){
        sunoDictionnary[dataExtract.sunoId] = songData;
    }
    fs.writeFileSync(SUNO_DATA_PATH, JSON.stringify(sunoDictionnary))

    audioQueue.add(filename)
    interaction.reply(`Ajout a la liste de lecture de : ${songData.title} par ${songData.author}`)
    audioQueue.play();
}

const readReddit = async (interaction) => {
    let index = 0;
    const cleanedRedditUrl = interaction.options.getString('url').replace(/\/$/, "");
    const dataExtract = extractRedditThreadInfo(cleanedRedditUrl)
    if (!dataExtract) throw "Not a reddit URL";

    const promiseList = [];
    const filename = `./reddit/${dataExtract.subreddit}/${dataExtract.threadId}/`;

    if (!fs.existsSync(filename)) {
        fs.mkdirSync(filename, { 'recursive': true });

        const redditJsonUrl = cleanedRedditUrl + '.json'
        console.log(`Fetching data from ${redditJsonUrl}`)
        const response = (await axios.get(redditJsonUrl)).data
        fs.writeFileSync(`${filename}/thread.json`, JSON.stringify(response))

        const post = response[0].data.children[0].data;
        var comments = response[1].data.children;

        let message = `Lecture d'un poste Reddit. Titre : ${post.title} par ${post.author}`;
        interaction.reply(message)
        promiseList.push(generateMessage(index++, message, filename));

        let chunks = splitStringIntoChunks(post.selftext)
        chunks.map(chunk => {
            promiseList.push(generateMessage(index++, chunk, filename));
        })

        const nbCommentsToRead = 2;
        var commentRead = 0;
        comments = comments.filter(
            (comment) => comment.data.author != 'AutoModerator'
        );

        comments.sort((a, b) => b.data.score - a.data.score);

        while (commentRead < nbCommentsToRead) {
            var comment = comments[commentRead]?.data;
            if (comment) {
                message = `${comment.author} à répondu : ${comment.body}`;
                promiseList.push(generateMessage(index++, message, filename));
            }

            commentRead++;
        }

        let responses = await Promise.all(promiseList);
        responses.map(audioFilename => {
            audioQueue.add(audioFilename)
        })
    } else {

        const response = JSON.parse(fs.readFileSync(`${filename}/thread.json`))

        const post = response[0].data.children[0].data;
        var comments = response[1].data.children;

        let message = `Lecture d'un poste Reddit. Titre : ${post.title} par ${post.author}`;
        interaction.reply(message)

        fs.readdir(filename, (err, files) => {
            const audioFiles = files
                .filter(file => path.extname(file).toLowerCase() === '.mp3')
                .map(file => {
                    const match = file.match(/^(\d+)_/);
                    const number = match ? parseInt(match[1], 10) : Infinity;
                    return { file, number };
                })
                .sort((a, b) => a.number - b.number)
                .map(file => audioQueue.add(`${filename}/${file.file}`))
        });
        audioQueue.play();
    }

};

const loadSunoData = () => {
    fs.readdir("./suno/", (err, files) => {
        files
            .filter(file => path.extname(file).toLowerCase() === '.mp3')
            .map(file => file.replace('.mp3',''))
            .forEach(file => getSunoSongData(file).then(songData => {
                    if(!sunoDictionnary[file]){
                        sunoDictionnary[file] = songData;
                    }
                    fs.writeFileSync(SUNO_DATA_PATH, JSON.stringify(sunoDictionnary))
                })
            )    
    });
}

const respondSunoList = async (interaction, filter = null) => {

    let sunoList = Object.keys(sunoDictionnary).map(key => {
        return {
            text: `*${sunoDictionnary[key].title} - ${sunoDictionnary[key].author} | <https://suno.com/song/${key}>`,
            title: sunoDictionnary[key].title,
            author: sunoDictionnary[key].author
        }
    })

    if(filter){
        sunoList = sunoList.filter(x => x.author.includes(filter) || x.title.includes(filter))
    }

    if(!sunoList.length) throw "No suno found with this search"

    let isFirst = true;
    for (const rep of chunkArray(sunoList, 10)) {
        if(isFirst){
            await interaction.reply(rep.map(x => x.text).join('\n'));
            isFirst = false;
        }else{
            await interaction.followUp(rep.map(x => x.text).join('\n'));
        }
    }
}

function chunkArray(array, chunkSize) {
    let result = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        result.push(array.slice(i, i + chunkSize));
    }
    return result;
}
