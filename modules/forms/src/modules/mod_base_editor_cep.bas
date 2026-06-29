
Imports mod_http_request
Imports mod_base_editor


Namespace mod_base_editor_cep

   Structure TCEPEditorData
      CEP As String
      Logradouro As String
      Complemento As String
      Unidade As String
      Bairro As String
      Localidade As String
      UF As String
      Estado As String
      Regiao As String
      IBGE As String
      DDD As String
      Siafi As String
   End Structure

   Class TCEPEditor
      Inherits TButtonTextEditor

      Data As TCEPEditorData

      OnLoadData As TNotifyEvent

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
         me.ImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAElSURBVDiNzZIhT8NQFIW/29e1YSssQNhGAg4ECAwGQYIj/AsUGkFIEMwjSQgIQnD8BASOzKBBIdDMYEa2bjTtu4jSUZZsIZmA477cd87LefeJqjKOnLHc/yLAzcPcaTgvaDXjzeJDcFPeWTCaKIBts6SWSjZX4fFHgBizD7qR8eHE8VqhmExnnLRATM4Qg4zaQu9K7p0SW07wdb5JWtpC0gaN6LoAlYtOjcTZRUTyAS++t+51IlBwiqnZhqkZC+Lz6jJEq/I06UkUQGqyIcRvoHGussPz0Aof17KtlruMbTd9g7xMibpbPetdKiwPBuyZk1rdO+pz/ua+XG5l5jxcNJGdHZyVC+9Ow1+RKW0lAHSpaUz5O5FmcKCNkVv4jf7+K48d8Am8RmQ96gzcJQAAAABJRU5ErkJggg=="
         me.Mascara = "99.999-999"
         me.ButtonHint = "Buscar pelo CEP o endereço nos correios (Logradouro, Bairro, Municipio e UF)"
         me.OnButtonClick = me._handleOnButtonClick
      End Sub

      Private Sub _handleOnButtonClick(pSender As TObject)
         Dim _cep As String = me.Text.Trim.Replace(".", "").Replace("-", "").Replace(" ", "")
         If _cep.Length <> 8 Then
            Forms.MessageBox.Show("CEP Inválido, o CEP deve conter 8 dígitos.")
            me.SetFocus()
            Exit Sub
         End If
         Dim _http As HttpRequest
         Dim _response As HttpResponse
         Try
            _http = HttpRequest.WinHttp()
            _response = _http.GETT("https://viacep.com.br/ws/" & _cep & "/json/")
            If Not _response.IsSuccessful Then
               Throw New Exception("Status: " & Cstr(_response.Status) & " - StatusText: " & _response.StatusText & Char(13) & _response.Data.AsText)
            End If
            If _response.Data.IsJson Then
               With _response.Data.AsJson
                  If .Has("cep") Then
                     me.Data.CEP = .GetString("cep")
                  End If
                  If .Has("logradouro") Then
                     me.Data.Logradouro = .GetString("logradouro")
                  End If
                  If .Has("complemento") Then
                     me.Data.Complemento = .GetString("complemento")
                  End If
                  If .Has("unidade") Then
                     me.Data.Unidade = .GetString("unidade")
                  End If
                  If .Has("bairro") Then
                     me.Data.Bairro = .GetString("bairro")
                  End If
                  If .Has("localidade") Then
                     me.Data.Localidade = .GetString("localidade")
                  End If
                  If .Has("uf") Then
                     me.Data.UF = .GetString("uf")
                  End If
                  If .Has("estado") Then
                     me.Data.Estado = .GetString("estado")
                  End If
                  If .Has("regiao") Then
                     me.Data.Regiao = .GetString("regiao")
                  End If
                  If .Has("ibge") Then
                     me.Data.IBGE = .GetString("ibge")
                  End If
                  If .Has("ddd") Then
                     me.Data.DDD = .GetString("ddd")
                  End If
                  If .Has("siafi") Then
                     me.Data.Siafi = .GetString("siafi")
                  End If
                  .Free()
               End With
               If me.OnLoadData <> NULL Then
                  me.OnLoadData(me)
               End If
            End If
         Catch ex As Exception
            Forms.MessageBox.Show("Erro ao obter dados do CEP [" & _cep & "]:" & Char(13) & ex._GetMessage())
         End Try
         If _http <> NULL Then
            _http.Free()
         End If
         If _response <> NULL Then
            _response.Free()
         End If
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace